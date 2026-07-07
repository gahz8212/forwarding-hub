차대번호(VIN) 기반 차량 제원 및 CBM 자동 산출 시스템 구현 지침서
md_content = """# 차대번호(VIN) 기반 차량 제원 및 CBM 자동 산출 시스템 구현 지침서

[ React Frontend ]
│  1. 차대번호(17자리) 입력 및 요청
▼
[ Node.js Backend ]
│  2. 공공데이터 API 호출 또는 제조사 사이트 스크래핑 (Puppeteer 등)
▼
[ 외부 데이터 소스 (Car365 / 제조사) ] ── 제원 데이터 반환 (L, W, H, Weight)
│
▼
[ Node.js Backend ] ── 3. CBM 계산 (L x W x H) 및 자체 DB 마스터 맵핑
│
▼  4. 정제된 스펙 데이터 반환 (JSON)
[ React Frontend ]
│  5. UI 렌더링 및 유저 최종 실측값 덮어쓰기(Override) 허용
▼
[최종 로로선 부킹 데이터 확정]

```

---

## 2. Node.js 백엔드 구현 (Backend)

백엔드는 외부 요청을 처리하고, 국토교통부 자동차종합정보 API를 호출하거나 Fallback용 스크래핑 엔진을 가동합니다.

### 2.1 주요 종속성 설치
```bash
npm install express axios dotenv
# 스크래핑 로직 필요 시
npm install puppeteer

```

### 2.2 외부 API 연동 및 CBM 계산 컨트롤러 (`src/controllers/vinController.js`)

공공데이터포털의 국토교통부_자동차종합정보 API서비스(Car365 연계)에서 차대번호로 기본/제원정보 조회를 신청한 후 발급받은 서비스키를 활용합니다.

```javascript
const axios = require('axios');

// CBM 및 중량 산출 비즈니스 로직
const getVehicleSpecByVIN = async (req, res) => {
    try {
        const { vin } = req.params;
        
        if (!vin || vin.length !== 17) {
            return res.status(400).json({ success: false, message: '올바른 17자리 차대번호를 입력해주세요.' });
        }

        // 1. 공공데이터포털(Car365 백엔드) API 호출 예시
        // ※ 실제 제공기관의 오퍼레이션 명세에 따라 URL 및 파라미터 구조를 맵핑합니다.
        const SERVICE_KEY = process.env.DATA_GO_KR_SERVICE_KEY;
        const apiUrl = `http://apis.data.go.kr/1611000/CarSpcifyInfoService/getCarSpecificationInfo`; 

        const response = await axios.get(apiUrl, {
            params: {
                serviceKey: SERVICE_KEY,
                vin: vin, // 차대번호 파라미터
                type: 'json'
            },
            timeout: 5000 // 5초 타임아웃 설정 (정부 시스템 지연 대비)
        });

        // API 응답 데이터 파싱 (아래 구조는 예시이며 기관 명세서에 맞춤)
        const carData = response.data?.response?.body?.items?.item;

        if (!carData) {
            return res.status(404).json({ 
                success: false, 
                message: '해당 차대번호로 등록된 제원 정보를 찾을 수 없습니다. 수동 입력을 진행해 주세요.' 
            });
        }

        // 밀리미터(mm) 단위를 미터(m) 단위로 변환하여 CBM 계산 준비
        const lengthM = parseFloat(carData.length || 0) / 1000; // 전장
        const widthM = parseFloat(carData.width || 0) / 1000;   // 전폭
        const heightM = parseFloat(carData.height || 0) / 1000; // 전고
        const weightKg = parseFloat(carData.totWt || 0);         // 총중량

        // 2. CBM 계산 (소수점 3자리까지 반올림)
        const calculatedCbm = Math.round((lengthM * widthM * heightM) * 1000) / 1000;

        return res.status(200).json({
            success: true,
            data: {
                vin: vin,
                modelName: carData.carNm || '알 수 없는 모델',
                dimensions: {
                    length: carData.length, // mm
                    width: carData.width,   // mm
                    height: carData.height  // mm
                },
                weight: weightKg, // kg
                cbm: calculatedCbm // 계산된 CBM
            }
        });

    } catch (error) {
        console.error('VIN 조회 에러:', error.message);
        return res.status(500).json({ 
            success: false, 
            message: '서버 내부 오류 또는 외부 API 연동 실패',
            error: error.message 
        });
    }
};

module.exports = { getVehicleSpecByVIN };

```

---

## 3. React 프론트엔드 구현 (Frontend)

프론트엔드는 **Zustand**를 이용해 차량 제원 상태를 관리하고, 표준 표 값이 자동 입력된 후에도 사용자가 개조 및 내부 적재물 변수를 반영하여 덮어쓰기(Override)할 수 있는 폼을 제공합니다.

### 3.1 Zustand 상태 관리 정의 (`src/store/useVehicleStore.js`)

```javascript
import { create } from 'zustand';
import axios from 'axios';

const useVehicleStore = create((set) => ({
    vehicleSpec: {
        vin: '',
        modelName: '',
        length: 0,
        width: 0,
        height: 0,
        weight: 0,
        cbm: 0
    },
    isLoading: false,
    error: null,

    // 차대번호 조회 액션
    fetchSpecByVin: async (vin) => {
        set({ isLoading: true, error: null });
        try {
            const response = await axios.get(`/api/v1/vehicle/vin/${vin}`);
            if (response.data.success) {
                const { data } = response.data;
                set({
                    vehicleSpec: {
                        vin: data.vin,
                        modelName: data.modelName,
                        length: data.dimensions.length,
                        width: data.dimensions.width,
                        height: data.dimensions.height,
                        weight: data.weight,
                        cbm: data.cbm
                    },
                    isLoading: false
                });
            }
        } catch (err) {
            set({ 
                error: err.response?.data?.message || '제원 정보를 가져오지 못했습니다.', 
                isLoading: false 
            });
        }
    },

    // 사용자가 입력 필드에서 값을 직접 변경(오버라이드)할 때 호출하는 액션
    updateField: (field, value) => set((state) => {
        const updatedSpec = { ...state.vehicleSpec, [field]: value };
        
        // 길이, 너비, 높이가 변경되면 CBM 실시간 재계산 (mm -> m 단위 변환 후 계산)
        if (['length', 'width', 'height'].includes(field)) {
            const l = parseFloat(updatedSpec.length || 0) / 1000;
            const w = parseFloat(updatedSpec.width || 0) / 1000;
            const h = parseFloat(updatedSpec.height || 0) / 1000;
            updatedSpec.cbm = Math.round((l * w * h) * 1000) / 1000;
        }
        
        return { vehicleSpec: updatedSpec };
    }),

    resetStore: () => set({
        vehicleSpec: { vin: '', modelName: '', length: 0, width: 0, height: 0, weight: 0, cbm: 0 },
        error: null
    })
}));

export default useVehicleStore;

```

### 3.2 차대번호 조회 및 실측값 수정 컴포넌트 (`src/components/VinSearchForm.jsx`)

```jsx
import React, { useState } from 'react';
import useVehicleStore from '../store/useVehicleStore';

const VinSearchForm = () => {
    const [inputVin, setInputVin] = useState('');
    const { vehicleSpec, fetchSpecByVin, updateField, isLoading, error } = useVehicleStore();

    const handleSearch = (e) => {
        e.preventDefault();
        if (inputVin.length === 17) {
            fetchSpecByVin(inputVin.toUpperCase());
        } else {
            alert('차대번호 17자리를 정확히 입력해주세요.');
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
            <h3>로로선 수출 차량 제원 조회 (차대번호 기반)</h3>
            
            {/* 검색 폼 */}
            <form onSubmit={handleSearch} style={{ marginBottom: '20px' }}>
                <input 
                    type="text" 
                    maxLength={17}
                    placeholder="차대번호 17자리 입력" 
                    value={inputVin}
                    onChange={(e) => setInputVin(e.target.value)}
                    style={{ padding: '8px', width: '250px', marginRight: '10px' }}
                />
                <button type="submit" disabled={isLoading}>
                    {isLoading ? '조회 중...' : '제원 조회'}
                </button>
            </form>

            {error && <p style={{ color: 'red' }}>{error}</p>}

            {/* 제원 확인 및 수동 오버라이드 폼 */}
            {vehicleSpec.vin && (
                <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '5px' }}>
                    <h4>차량 제원 정보 (수정 가능)</h4>
                    <p><strong>조회된 모델:</strong> {vehicleSpec.modelName}</p>
                    
                    <div style={{ marginBottom: '10px' }}>
                        <label>전장 (Length, mm): </label>
                        <input 
                            type="number" 
                            value={vehicleSpec.length}
                            onChange={(e) => updateField('length', e.target.value)}
                        />
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <label>전폭 (Width, mm): </label>
                        <input 
                            type="number" 
                            value={vehicleSpec.width}
                            onChange={(e) => updateField('width', e.target.value)}
                        />
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <label>전고 (Height, mm): </label>
                        <input 
                            type="number" 
                            value={vehicleSpec.height}
                            onChange={(e) => updateField('height', e.target.value)}
                            placeholder="루프랙/특장 포함 실측 높이"
                        />
                        <small style={{ display: 'block', color: '#666' }}>
                            *탑차 개조 또는 루프 캐리어 장착 시 실측 전고로 수정하세요.
                        </small>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <label>총중량 (Weight, kg): </label>
                        <input 
                            type="number" 
                            value={vehicleSpec.weight}
                            onChange={(e) => updateField('weight', e.target.value)}
                        />
                        <small style={{ display: 'block', color: '#666' }}>
                            *차량 내부에 부품/타이어 적재 시 예상 무게를 더해 수정하세요.
                        </small>
                    </div>

                    <hr />
                    {/* 최종 산출결과 */}
                    <div style={{ marginTop: '15px', background: '#f5f5f5', padding: '10px' }}>
                        <h5>최종 계산 결과 (선사 부킹 데이터)</h5>
                        <p><strong>최종 부피 (CBM):</strong> <span style={{ color: 'blue', fontSize: '1.2rem' }}>{vehicleSpec.cbm} CBM</span></p>
                        <p><strong>최종 중량 (Ton):</strong> {(vehicleSpec.weight / 1000).toFixed(3)} Ton</p>
                    </div>
                    
                    <button 
                        style={{ marginTop: '15px', width: '100%', padding: '10px', background: '#0070f3', color: '#fff', border: 'none' }}
                        onClick={() => alert('최종 데이터가 선사 부킹 큐에 저장되었습니다.')}
                    >
                        로로선 선적 요청(Booking) 확정
                    </button>
                </div>
            )}
        </div>
    );
};

export default VinSearchForm;

```

---

## 4. 실무 예외처리 지침 (Edge Cases)

1. **정부 API 지연 및 다운:**
* 국토부 Car365 시스템 점검 시 응답이 오지 않을 수 있습니다. 백엔드 `axios` 요청에 반드시 `timeout`을 걸고, 오류 발생 시 프론트엔드에서 "조회 실패: 전 제원 수동 입력 모드로 전환합니다"라며 빈 Input 필드를 활성화해 주는 UX 처리가 필수적입니다.


2. **외제차/수입차 처리:**
* 국내 연계 공공데이터는 국내 등록 차량 중심입니다. 수입차나 해외 현지 매입 차량의 경우 조회되지 않을 수 있으므로, 해당 경우에는 백엔드에서 오픈소스 성격의 `NHTSA VIN API`로 토스하거나 수동 입력으로 우회 가이드라인을 주어야 합니다.


3. **Zustand 실시간 계산 정밀도:**
* JavaScript의 부동 소수점 오차 방지를 위해 CBM 계산 단에서 반드시 `Math.round(value * 1000) / 1000` 처리를 수행하여 선사 톤수 정산 시 반올림 분쟁이 없도록 설계합니다.
"""



# Write the contents to a markdown file

filename = "vin_cbm_implementation_guide.md"
with open(filename, "w", encoding="utf-8") as f:
f.write(md_content)

print(f"File saved successfully as {filename}")

```
요청하신 대로 **React(Zustand 상태 관리)**와 **Node.js(Express + Axios)**를 기반으로 차대번호를 조회하여 CBM을 자동 계산하고, 필요 시 실측데이터로 오버라이드(덮어쓰기)할 수 있도록 구조화된 풀스택 구현 지침 마크다운(md) 파일을 생성했습니다.

수출용 물류 시스템 구축 시 실무에서 마주치는 예외 상황(개조 전고 반영, 내부 적재물 중량 가산, 정부 API 타임아웃 처리 등)에 대응하는 실질적인 비즈니스 로직과 컴포넌트 샘플을 상세하게 구성해 두었습니다.

아래 파일을 다운로드하여 프로젝트 가이드라인으로 활용해 보세요.

Your MD file is ready
[file-tag: code-generated-file-0-1783394188313669400]

---

### 📄 핵심 아키텍처 요약
1. **Node.js 백엔드:** 차대번호 17자리를 받아 공공데이터포털(Car365 백엔드) Open API를 호출하고, 가져온 전장/전폭/전고(mm 단위) 데이터를 미터 단위로 환산 후 부동 소수점 오차를 최소화하여 최종 CBM을 1차 산출합니다.
2. **React (Zustand 상태 관리):** 백엔드로부터 받은 제원 정보를 전역 상태에 바인딩합니다.
3. **오버라이드 인터페이스:** 유저가 화면의 input 요소(예: 전고, 중량 등)를 수정하면 Zustand 액션이 감지하여 **수정된 수치를 기반으로 CBM과 중량(Ton 단위)을 실시간으로 다시 계산**해 최종 로로선 Booking 데이터로 확정해 줍니다.

```