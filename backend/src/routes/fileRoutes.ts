import { Router } from 'express';
import multer from 'multer';
import { 
  uploadFile, 
  getFileGrid, 
  saveShipperMapping, 
  getShipperMapping, 
  exportCustomsExcel,
  uploadVehiclePhotos
} from '../controllers/fileController';

const router = Router();

// Multer 임시 보관 설정
const upload = multer({ dest: 'uploads/' });

// 파일 업로드 및 분석 엔드포인트
router.post('/upload', upload.single('file'), uploadFile);

// 로로선 중고차 여러 장의 사진 동시 업로드 엔드포인트 (최대 20장 제한 예시)
router.post('/upload-vehicle-photos', upload.array('photos', 20), uploadVehiclePhotos);

// 분석 완료된 그리드 데이터 조회 엔드포인트
router.get('/view/:fileKey', getFileGrid);

// 화주별 파일 매핑 설정 저장/조회 엔드포인트
router.post('/mapping', saveShipperMapping);
router.get('/mapping/:shipperName', getShipperMapping);

// 관세 신고용 엑셀 다운로드 엔드포인트
router.post('/export-customs-excel', exportCustomsExcel);

export default router;
