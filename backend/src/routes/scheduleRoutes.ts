import { Router } from 'express';
import { searchSchedules, getUniquePods, requestBooking } from '../controllers/scheduleController';

const router = Router();

// GET /api/schedules/pods
router.get('/pods', getUniquePods);

// GET /api/schedules/search?pod=...&cbm=...&weight=...
router.get('/search', searchSchedules);

// POST /api/schedules/book
router.post('/book', requestBooking);

export default router;
