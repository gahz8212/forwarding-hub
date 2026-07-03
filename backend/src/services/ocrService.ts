import vision from '@google-cloud/vision';

// 구글 비전 클라이언트 생성 (키가 설정되어야 함)
const client = new vision.ImageAnnotatorClient();

export interface OcrResult {
  rawText: string;
  plateNumber: string | null;
  vin: string | null;
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
    type: 'unknown',
  };

  // 1. 차량번호 정규식 (예: 12가3456, 123가4567)
  const plateRegex = /\d{2,3}[가-힣]{1}\d{4}/g;
  const plateMatch = text.match(plateRegex);
  if (plateMatch && plateMatch.length > 0) {
    result.plateNumber = plateMatch[0];
  }

  // 2. 차대번호 정규식 (17자리 영문숫자 조합, I, O, Q 제외)
  const vinRegex = /[A-HJ-NPR-Z0-9]{17}/g;
  const vinMatch = text.match(vinRegex);
  if (vinMatch && vinMatch.length > 0) {
    result.vin = vinMatch[0];
  }

  // 분류 로직 (단순화된 예시)
  if (result.plateNumber && result.vin) {
    // 둘 다 있으면 말소증일 확률이 높음
    result.type = 'document';
  } else if (result.vin && !result.plateNumber) {
    // 차대번호만 있으면 각인 사진일 확률이 높음
    result.type = 'vin';
  } else if (result.plateNumber && !result.vin) {
    // 차량번호만 있으면 외관(번호판) 사진일 확률이 높음
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
    // 구글 비전 API로 텍스트 감지 요청
    const [result] = await client.textDetection(imageBuffer);
    const detections = result.textAnnotations;
    
    if (!detections || detections.length === 0) {
      return { rawText: '', plateNumber: null, vin: null, type: 'unknown' };
    }

    // 전체 텍스트 (첫 번째 요소가 보통 전체 문서를 합친 텍스트입니다)
    const rawText = detections[0].description || '';
    
    // 정규식으로 정보 추출
    return extractVehicleInfo(rawText);
  } catch (error: any) {
    console.error('Google Vision API Error:', error.message);
    // 에러 발생 시에도 시스템이 멈추지 않도록(Graceful Failure) unknown 리턴
    return { rawText: '', plateNumber: null, vin: null, type: 'unknown' };
  }
}
