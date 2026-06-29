import { Router } from 'express';
import { login, logout, checkAuth, register, kakaoCallback } from '../controllers/authController';

const router = Router();

router.get('/kakao/callback', kakaoCallback);
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/check', checkAuth);

export default router;
