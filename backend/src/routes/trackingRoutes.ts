import { Router } from 'express';
import { 
  getTrackingInfo, 
  getAllShipments, 
  uploadDocs, 
  verifyDocs, 
  assignTruck,
  updateShipmentStatus
} from '../controllers/trackingController';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Multer 업로드 저장소 설정
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
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

export default router;
