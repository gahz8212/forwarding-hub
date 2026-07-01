import { Router } from 'express';
import { 
  searchSchedules, 
  getUniquePods, 
  requestBooking, 
  approveBooking, 
  rejectBooking,
  getClientBookings, 
  getAdminBookings,
  getBookingMessages,
  postBookingMessage,
  fetchMscSchedules
} from '../controllers/scheduleController';

const router = Router();

// GET /api/schedules/pods
router.get('/pods', getUniquePods);

// GET /api/schedules/search?pod=...&cbm=...&weight=...
router.get('/search', searchSchedules);

// GET /api/schedules/bookings (화주 전용 부킹 목록 조회)
router.get('/bookings', getClientBookings);

// GET /api/schedules/admin/bookings (포워더 전용 부킹 목록 조회)
router.get('/admin/bookings', getAdminBookings);

// POST /api/schedules/book (화주가 부킹 요청)
router.post('/book', requestBooking);

// POST /api/schedules/approve (포워더가 부킹 승인 및 알림톡 발송)
router.post('/approve', approveBooking);

// POST /api/schedules/reject (포워더가 부킹 반려 및 알림톡 발송 후 삭제)
router.post('/reject', rejectBooking);

// GET/POST /api/schedules/bookings/:bookingId/messages (부킹별 대화/사내메모 API)
router.get('/bookings/:bookingId/messages', getBookingMessages);
router.post('/bookings/:bookingId/messages', postBookingMessage);

// POST /api/schedules/fetch-msc (MSC API 실시간 스케줄 조회/수집)
router.post('/fetch-msc', fetchMscSchedules);

export default router;

