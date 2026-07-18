import vision, { ImageAnnotatorClient } from '@google-cloud/vision';

import fs from 'fs';
import path from 'path';

// 구글 비전 클라이언트 캐시
let client: ImageAnnotatorClient | null = null;
let credentialsChecked = false;
let credentialsPath: string | null = null;

/**
 * 구글 비전 API 클라이언트를 가져옵니다. 인증 키가 없으면 null을 리턴합니다.
 */
function getVisionClient(): ImageAnnotatorClient | null {
  if (credentialsChecked) {
    return client;
  }

  credentialsChecked = true;

  // 1. 환경 변수 확인
  let targetPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (targetPath) {
    const resolved = path.resolve(process.cwd(), targetPath);
    if (fs.existsSync(resolved)) {
      credentialsPath = resolved;
    }
  }

  // 2. 환경 변수가 없거나 파일이 없으면 기본 파일 경로 후보들 검색
  if (!credentialsPath) {
    const candidates = [
      path.join(__dirname, '../../google-credentials.json'), // backend/google-credentials.json (dist나 src 기준)
      path.join(process.cwd(), 'google-credentials.json'),
      path.join(process.cwd(), 'backend/google-credentials.json'),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        credentialsPath = cand;
        break;
      }
    }
  }

  if (credentialsPath) {
    try {
      const clientOptions: any = {};
      let isLoadedFromObject = false;

      try {
        const fileContent = fs.readFileSync(credentialsPath, 'utf8');
        const parsedCreds = JSON.parse(fileContent);

        if (parsedCreds && (parsedCreds.type === 'authorized_user' || parsedCreds.refresh_token)) {
          if (process.env.GOOGLE_CLOUD_PROJECT) {
            parsedCreds.quota_project_id = process.env.GOOGLE_CLOUD_PROJECT;
            clientOptions.projectId = process.env.GOOGLE_CLOUD_PROJECT;
          }
          clientOptions.credentials = parsedCreds;
          isLoadedFromObject = true;
          console.log(`[OCR] Google Vision API가 사용자 OAuth 인증 키(ADC)를 메모리에 로드했습니다.`);
        }
      } catch (parseErr) {}

      if (!isLoadedFromObject) {
        clientOptions.keyFilename = credentialsPath;
        if (process.env.GOOGLE_CLOUD_PROJECT) {
          clientOptions.projectId = process.env.GOOGLE_CLOUD_PROJECT;
          clientOptions.quotaProjectId = process.env.GOOGLE_CLOUD_PROJECT;
        }
      }

      client = new vision.ImageAnnotatorClient(clientOptions);
      console.log(`[OCR] Google Vision API 클라이언트가 정상 초기화되었습니다. (인증 경로: ${credentialsPath})`);
      if (process.env.GOOGLE_CLOUD_PROJECT) {
        console.log(`[OCR] 설정된 프로젝트 ID: ${process.env.GOOGLE_CLOUD_PROJECT}`);
      }
    } catch (err: any) {
      console.error(`[OCR] Google Vision API 클라이언트 초기화 중 에러 발생: ${err.message}`);
    }
  } else {
    console.warn('\n⚠️  [OCR WARNING] 구글 비전 API 인증 키(google-credentials.json)를 찾을 수 없습니다.');
    console.warn('   - 로컬 인증 키가 없으므로 Cloud Run/GCE 환경의 ADC(Application Default Credentials)를 사용합니다.\n');
    try {
      const clientOptions: any = {};
      if (process.env.GOOGLE_CLOUD_PROJECT) {
        clientOptions.projectId = process.env.GOOGLE_CLOUD_PROJECT;
      }
      client = new vision.ImageAnnotatorClient(clientOptions);
      console.log(`[OCR] Google Vision API 클라이언트가 ADC 기반으로 정상 초기화되었습니다.`);
    } catch (err: any) {
      console.error(`[OCR] ADC 기반 클라이언트 초기화 중 에러 발생: ${err.message}`);
    }
  }

  return client;
}

export interface OcrResult {
  rawText: string;
  plateNumber: string | null;
  vin: string | null;
  vehicleType: string | null;
  mileage: string | null;
  make: string | null;
  makeModel: string | null;
  modelYear: number | null;
  initialRegistrationDate: string | null;
  type: 'document' | 'plate' | 'vin' | 'unknown';
  apiError?: string;
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
    make: null,
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

  // 2. 차대번호 정규식 (17자리 영문숫자 조합, 숫자로 시작하지 않고 'KM' 또는 'K' 우선 매칭)
  // 차대번호: 라벨 뒤에 오는 경우도 첫 글자는 반드시 영문자여야 함 (예: 249902KMFXKS7BPYU 오인식 방지)
  const vinMatch2 = cleanText.match(/차대번호([A-HJ-NPR-Z][A-HJ-NPR-Z0-9]{16})/);
  if (vinMatch2) {
    result.vin = vinMatch2[1];
  } else {
    // 숫자로 시작하지 않는 17자리 패턴 매칭 (첫 문자는 영문자 [A-HJ-NPR-Z])
    const vinRegex = /[A-HJ-NPR-Z][A-HJ-NPR-Z0-9]{16}/g;
    const vinMatches = cleanText.match(vinRegex) || [];
    if (vinMatches.length > 0) {
      // 'K'로 시작하는 매치가 있다면 우선 선택 (KM, KN 등)
      const kVin = vinMatches.find(v => v.startsWith('K'));
      result.vin = kVin || vinMatches[0] || null;
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

  // 6.5 제작자 (제조사)
  const makerMatch = text.match(/제\s*작\s*자\s*[:\-\s]*([^\n]+)/);
  if (makerMatch && makerMatch[1].trim().length > 0) {
    let makerStr = makerMatch[1].trim();
    makerStr = makerStr.split(/제작연월|차량총중량|타이어|형식|이 자동차는/)[0].trim();
    if (makerStr.includes('현대')) {
      result.make = '현대';
    } else if (makerStr.includes('기아')) {
      result.make = '기아';
    } else if (makerStr.includes('르노') || makerStr.includes('삼성')) {
      result.make = '르노삼성';
    } else if (makerStr.includes('쌍용') || makerStr.includes('KG')) {
      result.make = 'KG모빌리티';
    } else if (makerStr.includes('대우') || makerStr.includes('쉐보레')) {
      result.make = '쉐보레';
    } else {
      result.make = makerStr.replace(/\(주\)/g, '').trim();
    }
  }

  // 6.7 제조사 추론 (제조사가 없거나 잘못 추출되었을 경우 차명 및 텍스트 기반으로 보정)
  if (!result.make) {
    if (cleanText.includes('현대') || cleanText.includes('HYUNDAI')) {
      result.make = '현대';
    } else if (cleanText.includes('기아') || cleanText.includes('KIA')) {
      result.make = '기아';
    } else if (cleanText.includes('르노') || cleanText.includes('삼성') || cleanText.includes('RENAULT')) {
      result.make = '르노삼성';
    } else if (cleanText.includes('쌍용') || cleanText.includes('KG') || cleanText.includes('케이쥐') || cleanText.includes('SSANGYONG')) {
      result.make = 'KG모빌리티';
    } else if (cleanText.includes('대우') || cleanText.includes('쉐보레') || cleanText.includes('CHEVROLET') || cleanText.includes('DAEWOO')) {
      result.make = '쉐보레';
    } else if (cleanText.includes('BMW')) {
      result.make = 'BMW';
    } else if (cleanText.includes('벤츠') || cleanText.includes('BENZ') || cleanText.includes('MERCEDES')) {
      result.make = '벤츠';
    } else if (cleanText.includes('아우디') || cleanText.includes('AUDI')) {
      result.make = '아우디';
    } else if (cleanText.includes('폭스바겐') || cleanText.includes('VOLKSWAGEN')) {
      result.make = '폭스바겐';
    } else if (cleanText.includes('렉서스') || cleanText.includes('LEXUS')) {
      result.make = '렉서스';
    } else if (cleanText.includes('토요타') || cleanText.includes('도요타') || cleanText.includes('TOYOTA')) {
      result.make = '토요타';
    }
  }

  // 차명(모델명) 기반으로 한 번 더 추론 보정
  if (result.makeModel && (!result.make || result.make === 'Unknown')) {
    const m = result.makeModel.toUpperCase();
    const hyundaiModels = ['GRANDEUR', '그랜저', 'AVANTE', '아반떼', 'SONATA', '쏘나타', 'SANTA', '산타페', 'TUCSON', '투싼', 'GENESIS', '제네시스', 'KONA', '코나', 'PALISADE', '팰리세이드', 'IONIQ', '아이오닉', 'VELOSTER', '벨로스터', 'ACCENT', '엑센트', 'STAREX', '스타렉스', 'STARIA', '스타리아'];
    const kiaModels = ['MORNING', '모닝', 'RAY', '레이', 'K3', 'K5', 'K7', 'K9', 'SPORTAGE', '스포티지', 'SORENTO', '쏘렌토', 'CARNIVAL', '카니발', 'SELTOS', '셀토스', 'SOUL', '쏘울', 'PRIDE', '프라이드', 'FORTE', '포르테', 'CEED', '씨드', 'NIRO', '니로', 'MOHAVE', '모하비', 'STINGER', '스팅어'];
    const renaultModels = ['SM3', 'SM5', 'SM6', 'SM7', 'QM3', 'QM5', 'QM6', 'XM3', '르노', 'RENAULT', '삼성'];
    const kgModels = ['TIVOLI', '티볼리', 'KORANDO', '코란도', 'REXTON', '렉스턴', 'TORRES', '토레스', '쌍용', 'SSANGYONG'];
    const chevroletModels = ['SPARK', '스파크', 'AVEO', '아베오', 'CRUZE', '크루즈', 'MALIBU', '말리부', 'IMPOLA', '임팔라', 'TRAX', '트랙스', 'EQUINOX', '이쿼녹스', 'CAPTIVA', '캡티바', 'COLORADO', '콜로라도', 'TAHOE', '타호', 'ORLANDO', '올란도', 'DAMAS', '다마스', 'LABO', '라보'];

    if (hyundaiModels.some(x => m.includes(x))) result.make = '현대';
    else if (kiaModels.some(x => m.includes(x))) result.make = '기아';
    else if (renaultModels.some(x => m.includes(x))) result.make = '르노삼성';
    else if (kgModels.some(x => m.includes(x))) result.make = 'KG모빌리티';
    else if (chevroletModels.some(x => m.includes(x))) result.make = '쉐보레';
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

  // 분류 로직 (단순화된 예시 및 문서 키워드 매칭 추가)
  const docKeywords = ['등록증', '말소', '증명서', '검사증', '자동차', '제원', '원부', '등록원부', '수출', '제작자', '제작연월', '차량총중량'];
  const hasDocKeywords = docKeywords.some(keyword => cleanText.includes(keyword));

  if (result.plateNumber && result.vin) {
    result.type = 'document';
  } else if (result.vin && (result.modelYear || result.initialRegistrationDate || result.vehicleType)) {
    // 차대번호만 있지만, 연식이나 최초등록일, 차종 등 말소증 전용 데이터가 추출되었다면 문서로 분류
    result.type = 'document';
  } else if (hasDocKeywords) {
    // 문서 키워드가 검출되면 문서로 분류 (차대번호 미검출 시 미분류 서류함 분기용)
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
  const visionClient = getVisionClient();
  if (!visionClient) {
    console.warn('[OCR] 구글 비전 API 인증이 설정되지 않아 OCR 분석을 건너뜁니다.');
    return { rawText: '', plateNumber: null, vin: null, vehicleType: null, mileage: null, make: null, makeModel: null, modelYear: null, initialRegistrationDate: null, type: 'unknown' };
  }

  try {
    // 구글 비전 API로 텍스트 감지 요청 (종이 서류(문서)에 최적화된 documentTextDetection 사용 및 한글 힌트 추가)
    const request = {
      image: { content: imageBuffer },
      imageContext: {
        languageHints: ['ko', 'en'], // 한글 차량번호 인식을 위한 언어 힌트
      },
    };
    const [result] = await visionClient.documentTextDetection(request);
    const detections = result.textAnnotations;
    
    if (!detections || detections.length === 0) {
      return { rawText: '', plateNumber: null, vin: null, vehicleType: null, mileage: null, make: null, makeModel: null, modelYear: null, initialRegistrationDate: null, type: 'unknown' };
    }

    // 전체 텍스트 (첫 번째 요소가 보통 전체 문서를 합친 텍스트입니다)
    const rawText = detections[0].description || '';
    
    // 정규식으로 정보 추출
    return extractVehicleInfo(rawText);
  } catch (error: any) {
    console.error('Google Vision API Error:', error.message);
    // 에러 발생 시에도 시스템이 멈추지 않도록(Graceful Failure) unknown 리턴 + 구체적 에러 메시지 포함
    return { 
      rawText: '', plateNumber: null, vin: null, vehicleType: null, 
      mileage: null, make: null, makeModel: null, modelYear: null, 
      initialRegistrationDate: null, type: 'unknown',
      apiError: error.message 
    };
  }
}
