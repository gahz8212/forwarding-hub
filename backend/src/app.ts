import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import trackingRoutes from './routes/trackingRoutes';
import scheduleRoutes from './routes/scheduleRoutes';

dotenv.config();

const app = express();

app.use(cors({
  origin: 'http://localhost:5173', // 프론트엔드 주소 (Vite 기본 포트)
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// 세션 설정
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // 개발 환경에서는 false (HTTPS 아님)
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 1일
  }
}));

// 라우트 설정
app.use('/api/auth', authRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/schedules', scheduleRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
