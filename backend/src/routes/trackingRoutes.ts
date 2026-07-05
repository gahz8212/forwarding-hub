import { Router } from 'express';
import { 
  getTrackingInfo, 
  getAllShipments, 
  uploadDocs, 
  verifyDocs, 
  assignTruck,
  updateShipmentStatus,
  reRequestDocs,
  getVehiclesByShipment,
  assignPhotosToVehicle,
  resetDashboardData,
  saveAllVehicles
} from '../controllers/trackingController';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../config/db';

const router = Router();

// Multer 업로드 저장소 설정
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const blNumber = req.body.blNumber || 'unknown';
      const [rows]: any = await pool.query('SELECT shipper FROM shipments WHERE bl_number = ?', [blNumber]);
      const shipperName = rows.length > 0 ? rows[0].shipper : 'unknown';
      
      // 폴더명 생성 시 특수문자 제거 및 공백 트림 처리
      const safeShipperName = shipperName.replace(/[^a-zA-Z0-9가-힣\s_-]/g, '').trim() || 'unknown';

      const now = new Date();
      const year = now.getFullYear().toString();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');

      const targetDir = path.join(uploadDir, safeShipperName, year, month);
      
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      cb(null, targetDir);
    } catch (err) {
      cb(err as Error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const blNumber = req.body.blNumber || 'unknown';
    const ext = path.extname(file.originalname);
    cb(null, `${blNumber}_${file.fieldname}_${Date.now()}${ext}`);
  }
});

const upload = multer({ storage });

// GET /api/tracking/all
router.get('/all', getAllShipments);

// GET /api/tracking/:blNumber
router.get('/:blNumber', getTrackingInfo);

// POST /api/tracking/upload-docs (화주가 인보이스/패킹리스트 업로드)
router.post('/upload-docs', upload.fields([
  { name: 'invoice', maxCount: 1 },
  { name: 'packingList', maxCount: 1 }
]), uploadDocs);

// POST /api/tracking/verify-docs (포워더가 서류 승인)
router.post('/verify-docs', verifyDocs);

// POST /api/tracking/assign-truck (포워더가 트럭 배정)
router.post('/assign-truck', assignTruck);

// POST /api/tracking/update-status (포워더가 선적 상태 업데이트)
router.post('/update-status', updateShipmentStatus);

// POST /api/tracking/re-request-docs (포워더가 서류 재요청)
router.post('/re-request-docs', reRequestDocs);

// GET /api/tracking/vehicles/:shipmentId (저장된 차량 목록 불러오기)
router.get('/vehicles/:shipmentId', getVehiclesByShipment);

// POST /api/tracking/vehicles/:id/photos (사진 배정 및 물리적 폴더 이동)
router.post('/vehicles/:id/photos', assignPhotosToVehicle);

// DELETE /api/tracking/vehicles/:shipmentId/reset (대시보드 데이터 및 미분류 사진 초기화)
router.delete('/vehicles/:shipmentId/reset', resetDashboardData);

// PUT /api/tracking/vehicles/:shipmentId/save-all (차량 전체 저장 및 완료된 뱃지 사진 정리)
router.put('/vehicles/:shipmentId/save-all', saveAllVehicles);

export default router;
