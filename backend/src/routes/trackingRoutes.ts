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
  saveAllVehicles,
  removePhotoFromVehicle,
  sendPdfToShipper,
  approveDoc,
  deleteDoc,
  updateVehicleStatus,
  getVehicleSpecByVIN,
  updateVehicleSpecs,
  deleteVehicle
} from '../controllers/trackingController';
import { runDailyMscTracking } from '../services/mscTrackerService';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../config/db';

const router = Router();

// Multer 업로드 저장소 설정 (GCP Cloud Run 휘발성 환경을 위해 memoryStorage 사용)
const storage = multer.memoryStorage();
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
router.post('/vehicles/:id/photos/remove', removePhotoFromVehicle);

// DELETE /api/tracking/vehicles/:shipmentId/reset (대시보드 데이터 및 미분류 사진 초기화)
router.delete('/vehicles/:shipmentId/reset', resetDashboardData);

// PUT /api/tracking/vehicles/:shipmentId/save-all (차량 전체 저장 및 완료된 뱃지 사진 정리)
router.put('/vehicles/:shipmentId/save-all', saveAllVehicles);

// POST /api/tracking/shipments/:shipmentId/send-pdf (PDF 생성 및 카카오톡 전송)
router.post('/shipments/:shipmentId/send-pdf', sendPdfToShipper);

// POST /api/tracking/approve-doc (화주가 서류 승인)
router.post('/approve-doc', approveDoc);

// POST /api/tracking/delete-doc (화주가 서류 삭제)
router.post('/delete-doc', deleteDoc);

// POST /api/tracking/vehicles/:id/status (개별 차량 상태 업데이트)
router.post('/vehicles/:id/status', updateVehicleStatus);

// GET /api/tracking/vehicles/vin/:vin (차대번호 기반 제원 조회)
router.get('/vehicles/vin/:vin', getVehicleSpecByVIN);

// PUT /api/tracking/vehicles/:id (개별 차량 제원 저장)
router.put('/vehicles/:id', updateVehicleSpecs);

// DELETE /api/tracking/vehicles/:id (개별 차량 삭제 — DB + GCS 사진 파일)
router.delete('/vehicles/:id', deleteVehicle);

// POST /api/tracking/test-daily-run (일일 MSC 트래킹 수동 테스트 트리거)
router.post('/test-daily-run', async (req, res) => {
  try {
    await runDailyMscTracking();
    res.json({ success: true, message: '일일 MSC 스케줄 및 트래킹 업데이트가 백그라운드에서 완료되었습니다.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
