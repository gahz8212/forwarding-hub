import { Router } from 'express';
import { getDispatchVehicles, assignDispatch, updateVehicleDispatch } from '../controllers/dispatchController';

const router = Router();

// GET /api/dispatch/vehicles - 배차 대상 차량 목록 조회
router.get('/vehicles', getDispatchVehicles);

// POST /api/dispatch/assign - 다수 차량 일괄 배차 정보 할당
router.post('/assign', assignDispatch);

// PUT /api/dispatch/vehicles/:vin - 특정 차량 개별 배차 정보 업데이트
router.put('/vehicles/:vin', updateVehicleDispatch);

export default router;
