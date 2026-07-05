import vision from '@google-cloud/vision';

// 구글 비전 클라이언트 생성 (키가 설정되어야 함)
const client = new vision.ImageAnnotatorClient();

export interface OcrResult {
  rawText: string;
  plateNumber: string | null;
  vin: string | null;
  vehicleType: string | null;
  mileage: string | null;
  makeModel: string | null;
  modelYear: number | null;
  initialRegistrationDate: string | null;
  type: 'document' | 'plate' | 'vin' | 'unknown';
}

/**
 * 정규표현식을 통해 텍스트에서 차량번호와 차대번호를 추출합니다.
 */
function extractVehicleInfo(text: string): OcrResult {
  const result: OcrResult = {
    rawText: text,
    plateNumber: null,
    vin: null,
    vehicleType: null,
    mileage: null,
    makeModel: null,
    modelYear: null,
    initialRegistrationDate: null,
    type: 'unknown',
  };

  // 모든 공백 및 특수문자(기호, 괄호 등)를 제거하여 OCR 노이즈에 유연하게 대응
  const cleanText = text.replace(/[\s\-_:\.,\|'\"\[\]\(\)\<\>]/g, '').toUpperCase();

  // 실제 대한민국 자동차 번호판에 사용되는 받침 없는 한글 40자 (군용, 외교용 제외 민수용)
  const validChars = '가나다라마거너더러머버서어저고노도로모보소오조구누두루무부수우주바사아자배허하호';
  
  // 1. 차량번호 정규식 (유연하게 매칭)
  const plateMatch2 = text.match(new RegExp(`등록번호\\s*[:\-\s]?\\s*([0-9]{2,3}[${validChars}][0-9]{4})`)) 
                   || cleanText.match(new RegExp(`등록번호([0-9]{2,3}[${validChars}][0-9]{4})`));
  if (plateMatch2) {
    result.plateNumber = plateMatch2[1];
  } else {
    const plateRegex = new RegExp(`\\d{2,3}[${validChars}]\\d{4}|\\d{6,7}`, 'g');
    const plateMatch = cleanText.match(plateRegex);
    if (plateMatch && plateMatch.length > 0) {
      const match = plateMatch[0];
      if (/^\d{6,7}$/.test(match)) {
        result.plateNumber = match.slice(0, -4) + '?' + match.slice(-4);
      } else {
        result.plateNumber = match;
      }
    }
  }

  // 2. 차대번호 정규식 (17자리 영문숫자 조합)
  const vinMatch2 = cleanText.match(/차대번호([A-HJ-NPR-Z0-9]{17})/);
  if (vinMatch2) {
    result.vin = vinMatch2[1];
  } else {
    const vinRegex = /[A-HJ-NPR-Z0-9]{17}/g;
    const vinMatch = cleanText.match(vinRegex);
    if (vinMatch && vinMatch.length > 0) {
      result.vin = vinMatch[0];
    }
  }

  // 3. 차종 (승용, 승합, 화물, 특수)
  const typeMatch2 = cleanText.match(/차종(승용|승합|화물|특수)/) || cleanText.match(/(승용|승합|화물|특수)/);
  if (typeMatch2) {
    result.vehicleType = typeMatch2[1];
  }

  // 4. 주행거리 (숫자 + km 또는 숫자 연속)
  const mileageMatch2 = cleanText.match(/주행거리(\d+)(KM)?/) || text.match(/주행거리\s*[:\-\s]*([0-9,]+)/);
  if (mileageMatch2) {
    const rawMileage = mileageMatch2[1] || mileageMatch2[2] || '';
    result.mileage = rawMileage.replace(/,/g, '');
  }

  // 5. 모델연도 (4자리 숫자)
  const yearMatch2 = cleanText.match(/모델연도(\d{4})/) || cleanText.match(/연식(\d{4})/) || text.match(/모델연도\s*[:\-\s]*(\d{4})/);
  if (yearMatch2) {
    result.modelYear = parseInt(yearMatch2[1], 10);
  }

  // 6. 차명
  // 띄어쓰기가 중요하므로 원본 text 보존하여 정규식 탐색
  const makeModelMatchOriginal = text.match(/차\s*명\s*[:\-\s]*([^\n]+)/);
  if (makeModelMatchOriginal && makeModelMatchOriginal[1].trim().length > 0) {
    let makeModelStr = makeModelMatchOriginal[1].trim();
    // 같은 줄에 다른 속성이 붙어있다면 잘라내기
    makeModelStr = makeModelStr.split(/모델|차종|차대|승용|승합|화물|특수/)[0].trim();
    result.makeModel = makeModelStr;
  }

  // 7. 최초등록일 (YYYY.MM.DD 등)
  const dateMatch2 = cleanText.match(/최초등록일(\d{4})년?(\d{1,2})월?(\d{1,2})일?/);
  if (dateMatch2) {
    result.initialRegistrationDate = `${dateMatch2[1]}-${dateMatch2[2].padStart(2, '0')}-${dateMatch2[3].padStart(2, '0')}`;
  } else {
    const dateMatchOrig = text.match(/최초등록일\s*[:\-\s]?\s*(\d{4})[\.\-년\s]*(\d{1,2})[\.\-월\s]*(\d{1,2})/);
    if (dateMatchOrig) {
      result.initialRegistrationDate = `${dateMatchOrig[1]}-${dateMatchOrig[2].padStart(2, '0')}-${dateMatchOrig[3].padStart(2, '0')}`;
    }
  }

  // 분류 로직 (단순화된 예시)
  if (result.plateNumber && result.vin) {
    result.type = 'document';
  } else if (result.vin && (result.modelYear || result.initialRegistrationDate || result.vehicleType)) {
    // 차대번호만 있지만, 연식이나 최초등록일, 차종 등 말소증 전용 데이터가 추출되었다면 문서로 분류
    result.type = 'document';
  } else if (result.vin && !result.plateNumber) {
    result.type = 'vin';
  } else if (result.plateNumber && !result.vin) {
    result.type = 'plate';
  }

  return result;
}

/**
 * 이미지를 구글 비전 API에 전송하고 결과를 분석하여 반환합니다.
 * @param imageBuffer 사진 바이너리 데이터
 */
export async function analyzeVehiclePhoto(imageBuffer: Buffer): Promise<OcrResult> {
  try {
    // 구글 비전 API로 텍스트 감지 요청 (종이 서류(문서)에 최적화된 documentTextDetection 사용 및 한글 힌트 추가)
    const request = {
      image: { content: imageBuffer },
      imageContext: {
        languageHints: ['ko', 'en'], // 한글 차량번호 인식을 위한 언어 힌트
      },
    };
    const [result] = await client.documentTextDetection(request);
    const detections = result.textAnnotations;
    
    if (!detections || detections.length === 0) {
      return { rawText: '', plateNumber: null, vin: null, vehicleType: null, mileage: null, makeModel: null, modelYear: null, initialRegistrationDate: null, type: 'unknown' };
    }

    // 전체 텍스트 (첫 번째 요소가 보통 전체 문서를 합친 텍스트입니다)
    const rawText = detections[0].description || '';
    
    // 정규식으로 정보 추출
    return extractVehicleInfo(rawText);
  } catch (error: any) {
    console.error('Google Vision API Error:', error.message);
    // 에러 발생 시에도 시스템이 멈추지 않도록(Graceful Failure) unknown 리턴
    return { rawText: '', plateNumber: null, vin: null, vehicleType: null, mileage: null, makeModel: null, modelYear: null, initialRegistrationDate: null, type: 'unknown' };
  }
}
