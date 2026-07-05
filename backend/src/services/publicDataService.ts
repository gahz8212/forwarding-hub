import axios from 'axios';

export interface PublicVehicleInfo {
  vin: string;
  make: string;
  model: string;
  year: number | null;
}

/**
 * 공공데이터포털(data.go.kr)의 자동차 기본정보 조회 API 연동 (구현체)
 * 차량번호(plateNumber)를 통해 차대번호 및 제원을 가져옵니다.
 */
export async function getVehicleInfoFromPublicData(plateNumber: string): Promise<PublicVehicleInfo | null> {
  if (!plateNumber) return null;

  const API_KEY = process.env.PUBLIC_DATA_API_KEY; // .env 파일에 공공데이터 API 키를 입력해야 합니다.
  
  // 만약 API 키가 설정되어 있지 않다면 (개발/테스트 환경용 모의 데이터 반환)
  if (!API_KEY || API_KEY === 'your_api_key_here') {
    console.log(`[공공데이터 모의 호출] 차량번호: ${plateNumber}`);
    
    // 모의(Mock) 데이터 생성
    // 실제 운영 환경에서는 아래 axios 코드를 활성화하세요.
    return {
      vin: `KNDMOCK${Math.floor(Math.random() * 10000000000)}`,
      make: '현대/기아(Mock)',
      model: '테스트모델(Mock)',
      year: new Date().getFullYear() - Math.floor(Math.random() * 5)
    };
  }

  try {
    // TODO: 실제 공공데이터포털의 API 엔드포인트 URL 및 파라미터 구조에 맞게 수정 필요
    // 아래는 일반적인 공공데이터 REST API 호출 예시입니다.
    const url = 'http://apis.data.go.kr/B553658/CarInfoService/getCarInfo';
    
    const response = await axios.get(url, {
      params: {
        serviceKey: decodeURIComponent(API_KEY), // 키 인코딩 문제 방지
        carRegNo: plateNumber, // 차량번호
        _type: 'json'
      }
    });

    const items = response.data?.response?.body?.items?.item;
    if (items && items.length > 0) {
      const data = items[0];
      return {
        vin: data.vin || null,
        make: data.makeName || 'Unknown',
        model: data.modelName || 'Unknown',
        year: data.modelYear ? parseInt(data.modelYear, 10) : null
      };
    }

    return null;
  } catch (error: any) {
    console.error('공공데이터 API 호출 에러:', error.message);
    return null;
  }
}
