import { Router } from 'express';
import { getTrackingInfo, getAllShipments } from '../controllers/trackingController';

const router = Router();

// GET /api/tracking/all
router.get('/all', getAllShipments);

// GET /api/tracking/:blNumber
router.get('/:blNumber', getTrackingInfo);

export default router;
