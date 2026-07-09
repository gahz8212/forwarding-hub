# 🗄️ MySQL 스키마 및 JavaScript 부동 소수점 오차 해결 가이드

본 문서는 Node.js + MySQL 환경에서 로로선 정산 시스템을 구축할 때 필요한 데이터베이스 구조와, 금융 계산 시 발생하는 JavaScript의 연산 오차 방지 대책을 정의합니다.

---

## 1. 💾 MySQL 테이블 스키마 디자인 (DDL)

정산 데이터의 무결성을 유지하기 위해 돈과 관련된 모든 필드는 `FLOAT`이나 `DOUBLE` 대신 **`DECIMAL` 타입**을 사용합니다. 

* `DECIMAL(13, 2)`: 총 13자리 중 소수점 아래 2자리까지 허용 (USD 센트 단위 계산용)
* `DECIMAL(15, 0)`: 원화(KRW) 계산용 (소수점 불필요)

```sql
-- 1. 화주(업체) 및 마진 설정 테이블
CREATE TABLE clients (
    client_id VARCHAR(50) PRIMARY KEY,
    client_name VARCHAR(100) NOT NULL,
    margin_type ENUM('PERCENTAGE', 'FIXED') NOT NULL DEFAULT 'PERCENTAGE',
    ocean_margin_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00,  -- 예: 12.50%
    local_margin_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00,  -- 예: 10.00%
    fixed_margin_per_unit DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- 정액 마진 시 대당 \$
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. 선사 원가 매트릭스 테이블 (최신 기준 단가 관리)
CREATE TABLE cost_rates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cargo_type ENUM('SEDAN', 'SUV', 'TRUCK', 'BUS') NOT NULL,
    ocean_cost_usd DECIMAL(10, 2) NOT NULL,    -- 선사 매입 해상 운임 (USD)
    lashing_cost_krw DECIMAL(15, 0) NOT NULL,  -- 고박료 원가 (KRW)
    thc_cost_krw DECIMAL(15, 0) NOT NULL,      -- THC 원가 (KRW)
    bl_fee_krw DECIMAL(15, 0) NOT NULL,        -- BL 서류비 원가 (KRW)
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. 정산서 마스터 테이블 (Invoice Master)
CREATE TABLE invoices (
    invoice_no VARCHAR(50) PRIMARY KEY,        -- 인보이스 번호 (예: INVOICE-2026-0001)
    client_id VARCHAR(50) NOT NULL,
    vessel_name VARCHAR(100) NOT NULL,
    pol VARCHAR(50) NOT NULL,                  -- 선적항
    pod VARCHAR(50) NOT NULL,                  -- 양하항
    exchange_rate DECIMAL(7, 2) NOT NULL,      -- 적용 환율 (예: 1350.00)
    total_ocean_usd DECIMAL(13, 2) NOT NULL,   -- 마진 포함 총 USD 해상운임
    total_local_krw DECIMAL(15, 0) NOT NULL,   -- 마진 포함 총 KRW 로컬비용
    final_amount_krw DECIMAL(15, 0) NOT NULL,  -- 최종 원화 청구 금액
    payment_status ENUM('PENDING', 'PAID', 'OVERDUE') NOT NULL DEFAULT 'PENDING',
    due_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(client_id)
);

-- 4. 정산서 상세 차량 목록 테이블 (Invoice Item Detail)
CREATE TABLE invoice_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_no VARCHAR(50) NOT NULL,
    vin VARCHAR(17) NOT NULL,                  -- 차대번호
    model_name VARCHAR(50) NOT NULL,           -- 차종
    cargo_type ENUM('SEDAN', 'SUV', 'TRUCK', 'BUS') NOT NULL,
    applied_ocean_usd DECIMAL(10, 2) NOT NULL, -- 해당 차량에 청구된 해상운임 (마진포함)
    applied_lashing_krw DECIMAL(15, 0) NOT NULL,-- 해당 차량에 청구된 고박료 (마진포함)
    applied_thc_krw DECIMAL(15, 0) NOT NULL,    -- 해당 차량에 청구된 THC (마진포함)
    FOREIGN KEY (invoice_no) REFERENCES invoices(invoice_no) ON DELETE CASCADE
);
```

---

## 2. ⚡ JavaScript 부동 소수점 오차 해결방안

JavaScript는 숫자를 소수점을 가진 64비트 부동소수점(`IEEE 754`) 형식으로 표현하기 때문에, `0.1 + 0.2 // 0.30000000000000004` 같은 연산 오류가 발생합니다. 돈을 다루는 정산 시스템에서는 치명적이므로 아래의 해결책 중 하나를 반드시 적용해야 합니다.

### 방법 A: 정수형 전환 연산 (가장 가볍고 외부 라이브러리 없음)
* 소수점이 있는 **달러(USD) 단가를 100을 곱해 센트(Cent) 단위의 정수**로 바꾼 뒤 연산하고, 최종 단계에서 다시 100으로 나누는 방식입니다. 정수끼리의 연산은 오차가 없습니다.

### 방법 B: `big.js` 라이브러리 사용 (추천 🌟)
* 소수점 연산이 잦은 정산 시스템에서는 실수를 방지하기 위해 `big.js` 또는 `bignumber.js` 라이브러리를 사용하는 것이 안전합니다.
* 설치: `npm install big.js`

---

## 3. 🛠️ Node.js 정산 계산 로직 구현 (`big.js` 반영)

아래 코드는 MySQL에서 조회한 데이터 구조를 바탕으로 부동 소수점 오류 없이 마진과 환율을 계산하는 실제 Node.js 서비스 레이어 코드 예시입니다.

```javascript
const Big = require('big.js');

/**
 * 부동 소수점 오류가 없는 최종 정산 금액 산출 함수
 * @param {Array} carList - 정산 대상 차량 리스트 객체 배열
 * @param {Object} clientMargin - DB에서 가져온 화주 마진 설정 데이터
 * @param {Object} costRates - DB에서 가져온 기준 매입 원가 매트릭스
 * @param {string} exchangeRateStr - 당일 고시 환율 (문자열 전송 권장)
 */
function calculateSafeInvoice(carList, clientMargin, costRates, exchangeRateStr) {
  
  // 1. 마진율 변수 Big 객체화 (예: 12.5% -> 0.125)
  // 매출단가 배율 = 1 + (마진율 / 100)
  const oceanMarginMultiplier = new Big(clientMargin.ocean_margin_rate).div(100).plus(1);
  const localMarginMultiplier = new Big(clientMargin.local_margin_rate).div(100).plus(1);
  const exchangeRate = new Big(exchangeRateStr);

  let totalOceanUSD = new Big(0);
  let totalLocalKRW = new Big(0);
  
  const calculatedItems = [];

  // 2. 차량별 루프 돌며 마진 반영 단가 산출
  for (const car of carList) {
    // 해당 차종의 원가 찾기
    const cost = costRates.find(r => r.cargo_type === car.cargo_type);
    
    // 해상 운임 매출가 계산: 원가(USD) * 마진율 배율
    // 소수점 셋째 자리에서 반올림하여 둘째 자리(\$ 센트)까지 확정 (round(2, 0): 반올림)
    const sellOceanUSD = new Big(cost.ocean_cost_usd).times(oceanMarginMultiplier).round(2, 1);
    
    // 로컬 비용 매출가 계산: 원가(KRW) * 마진율 배율 (원화는 소수점이 없으므로 반올림하여 정수화)
    const sellLashingKRW = new Big(cost.lashing_cost_krw).times(localMarginMultiplier).round(0, 1);
    const sellThcKRW = new Big(cost.thc_cost_krw).times(localMarginMultiplier).round(0, 1);

    // 차량별 금액 누적
    totalOceanUSD = totalOceanUSD.plus(sellOceanUSD);
    totalLocalKRW = totalLocalKRW.plus(sellLashingKRW).plus(sellThcKRW);

    // 상세 내역 저장용 데이터 가공
    calculatedItems.push({
      vin: car.vin,
      model_name: car.model_name,
      cargo_type: car.cargo_type,
      applied_ocean_usd: sellOceanUSD.toString(),
      applied_lashing_krw: sellLashingKRW.toString(),
      applied_thc_krw: sellThcKRW.toString()
    });
  }

  // 3. 건당 고정 로컬 비용(B/L Fee) 추가 (마진 없이 실비 패스스루 전제)
  // 매트릭스에 등록된 첫 번째 차종의 bl_fee를 기준 처리
  const blFeeKRW = new Big(costRates[0].bl_fee_krw);
  totalLocalKRW = totalLocalKRW.plus(blFeeKRW);

  // 4. 환전 및 최종 청구 금액 결정
  // 해상운임(USD 총액) * 환율 = 원화 환산액
  const convertedOceanKRW = totalOceanUSD.times(exchangeRate).round(0, 0); // 원단위 절사(round(0, 0))
  
  // 최종 원화 청구액 = 원화 환산액 + 로컬 비용 총액
  const finalAmountKRW = convertedOceanKRW.plus(totalLocalKRW);

  return {
    master: {
      total_ocean_usd: totalOceanUSD.toString(),
      total_local_krw: totalLocalKRW.toString(),
      final_amount_krw: finalAmountKRW.toString(),
      exchange_rate: exchangeRate.toString()
    },
    items: calculatedItems
  };
}

// ==========================================
// [테스트 실행 예시]
// ==========================================
const mockCars = [
  { vin: 'VIN001', model_name: 'Tucson', cargo_type: 'SUV' },
  { vin: 'VIN002', model_name: 'K5', cargo_type: 'SEDAN' }
];

const mockMargin = { ocean_margin_rate: '12.50', local_margin_rate: '10.00' };

const mockCosts = [
  { cargo_type: 'SUV', ocean_cost_usd: '1600.00', lashing_cost_krw: '40000', thc_cost_krw: '25000', bl_fee_krw: '40000' },
  { cargo_type: 'SEDAN', ocean_cost_usd: '1300.00', lashing_cost_krw: '40000', thc_cost_krw: '25000', bl_fee_krw: '40000' }
];

const result = calculateSafeInvoice(mockCars, mockMargin, mockCosts, '1350.50');
console.log(result);
```
