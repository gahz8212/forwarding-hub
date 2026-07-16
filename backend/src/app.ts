import dotenv from 'dotenv';
dotenv.config({ override: true });

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import authRoutes from './routes/authRoutes';
import trackingRoutes from './routes/trackingRoutes';
import scheduleRoutes from './routes/scheduleRoutes';
import fileRoutes from './routes/fileRoutes';
import billingRoutes from './routes/billingRoutes';
import dispatchRoutes from './routes/dispatchRoutes';
import { initScheduler } from './services/scheduler';
import MySQLStoreFactory from 'express-mysql-session';
import mysql from 'mysql2/promise';

// 1. MySQL 커넥션 풀 설정 (로컬 TCP 및 GCP UNIX 소켓 대응)
const dbOptions: mysql.PoolOptions = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,//INSTANCE_UNIX_SOCKET ? undefined : (process.env.DB_HOST || 'localhost'),
  port: Number(process.env.DB_PORT)||3306,//INSTANCE_UNIX_SOCKET ? undefined : (process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3307),
  socketPath: process.env.INSTANCE_UNIX_SOCKET || undefined,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
};

const dbPool = mysql.createPool(dbOptions);

// 2. 세션 스토어 초기화 및 만료 설정 추가
const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({
  clearExpired: true,
  checkExpirationInterval: 900000, // 15분마다 만료 세션 정리
  expiration: 86400000, // 세션 유지 기간 (1일)
}, dbPool.pool as ConstructorParameters<typeof MySQLStore>[1]);

// 백그라운드 크론 스케줄러 가동
initScheduler();

const app = express();
app.set('trust proxy', 1); // GCP Cloud Run (프록시) 환경에서 HTTPS 세션 쿠키 정상 작동을 위해 프록시 신뢰 설정 추가

const server = http.createServer(app);

// 허용할 CORS 오리진 동적으로 수집
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'https://forwarding-hub-frontend-269919807885.asia-northeast3.run.app',
  'https://forwarding.memyself.shop' // 🚀 새롭게 추가된 GCP 커스텀 도메인!
];

if (process.env.FRONTEND_URL) {
  const envOrigins = process.env.FRONTEND_URL.split(',').map(o => o.trim());
  allowedOrigins.push(...envOrigins);
}

// Socket.io 초기화
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

// io 객체를 Express app에 바인딩하여 라우터/컨트롤러에서 쓸 수 있게 함
app.set('io', io);
(global as any).io = io; // 🚀 백그라운드 서비스용 글로벌 바인딩 추가!

app.use(cors({
  origin: allowedOrigins,
  credentials: true // 로그인(쿠키/인증) 시 필수!
}));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// GCP 환경 판별 (GCP 배포 시 세션 쿠키 공유 대응)
const isProduction = process.env.NODE_ENV === 'production' || (process.env.DB_HOST && process.env.DB_HOST !== 'localhost');

// 세션 설정
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    secure: !!isProduction, // HTTPS 환경(GCP)에서만 전송
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax', // 프론트와 백엔드가 다를 때(GCP) 크로스 도메인 쿠키 전송 허용
    maxAge: 1000 * 60 * 60 * 24 // 1일
  }
}));

// 라우트 설정
app.use('/api/auth', authRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/dispatch', dispatchRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Socket.io 연결 이벤트 핸들링
io.on('connection', (socket) => {
  console.log(`소켓 연결 성공: ${socket.id}`);

  // 특정 룸 참가 (예: admin, client)
  socket.on('join', (data: { role: string; clientId?: number }) => {
    if (data.role === 'admin') {
      socket.join('admin');
      console.log(`소켓 ${socket.id}가 관리자(admin) 룸에 참가했습니다.`);
    } else if (data.role === 'client' && data.clientId) {
      socket.join(`client_${data.clientId}`);
      console.log(`소켓 ${socket.id}가 화주(client) 룸 [client_${data.clientId}]에 참가했습니다.`);
    }
  });

  // 특정 B/L 트래킹 룸 참가 (실시간 상태 업데이트 수신용)
  socket.on('join_bl_room', (data: { blNumber: string }) => {
    if (data.blNumber) {
      socket.join(data.blNumber);
      console.log(`소켓 ${socket.id}가 B/L 트래킹 룸 [${data.blNumber}]에 입장했습니다.`);
    }
  });

  // 특정 B/L 트래킹 룸 퇴장
  socket.on('leave_bl_room', (data: { blNumber: string }) => {
    if (data.blNumber) {
      socket.leave(data.blNumber);
      console.log(`소켓 ${socket.id}가 B/L 트래킹 룸 [${data.blNumber}]에서 퇴장했습니다.`);
    }
  });

  // 부킹별 개별 대화방 입장
  socket.on('join_booking_chat', (data: { bookingId: number }) => {
    if (data.bookingId) {
      socket.join(`booking_chat_${data.bookingId}`);
      console.log(`소켓 ${socket.id}가 부킹 대화방 [booking_chat_${data.bookingId}]에 입장했습니다.`);
    }
  });

  // 부킹별 개별 대화방 퇴장
  socket.on('leave_booking_chat', (data: { bookingId: number }) => {
    if (data.bookingId) {
      socket.leave(`booking_chat_${data.bookingId}`);
      console.log(`소켓 ${socket.id}가 부킹 대화방 [booking_chat_${data.bookingId}]에서 퇴장했습니다.`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`소켓 연결 해제: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
