import { Router } from 'express';
import { searchSchedules, getUniquePods } from '../controllers/scheduleController';

const router = Router();

// GET /api/schedules/pods
router.get('/pods', getUniquePods);

// GET /api/schedules/search?pod=...&cbm=...&weight=...
router.get('/search', searchSchedules);

export default router;
