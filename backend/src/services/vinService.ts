import axios from 'axios';

export interface VehicleSpecs {
  make: string;
  model: string;
  year: number | null;
}

/**
 * 미국 NHTSA 무료 API를 사용하여 차대번호(VIN)로 차량 제원을 조회합니다.
 * 한국 차량(현대, 기아 등)도 국제 규격을 따르므로 모두 조회가 가능합니다.
 * @param vin 17자리 차대번호
 */
export async function decodeVin(vin: string): Promise<VehicleSpecs | null> {
  if (!vin || vin.length !== 17) return null;

  try {
    const response = await axios.get(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
    
    if (response.data && response.data.Results) {
      const results = response.data.Results;
      
      let make = '';
      let model = '';
      let year: number | null = null;

      // API 결과 배열에서 Make, Model, Model Year 값을 추출합니다.
      for (const item of results) {
        if (item.Variable === 'Make') make = item.Value || '';
        if (item.Variable === 'Model') model = item.Value || '';
        if (item.Variable === 'Model Year') {
          const parsedYear = parseInt(item.Value, 10);
          if (!isNaN(parsedYear)) year = parsedYear;
        }
      }

      // 최소한 제조사나 모델 정보가 있으면 반환
      if (make || model) {
        return {
          make: make || 'Unknown',
          model: model || 'Unknown',
          year
        };
      }
    }
    return null;
  } catch (error) {
    console.error(`VIN Decode 실패 (${vin}):`, error);
    return null; // 실패 시 에러를 뿜지 않고 null 반환 (로직이 멈추지 않게 함)
  }
}
