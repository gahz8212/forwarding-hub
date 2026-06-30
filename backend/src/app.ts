import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import dotenv from 'dotenv';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import authRoutes from './routes/authRoutes';
import trackingRoutes from './routes/trackingRoutes';
import scheduleRoutes from './routes/scheduleRoutes';
import { initScheduler } from './services/scheduler';

dotenv.config();

// 백그라운드 크론 스케줄러 가동
initScheduler();

const app = express();
const server = http.createServer(app);

// Socket.io 초기화
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'], // 다중 오리진 허용
    credentials: true
  }
});

// io 객체를 Express app에 바인딩하여 라우터/컨트롤러에서 쓸 수 있게 함
app.set('io', io);

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 세션 설정
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // 개발 환경에서는 false
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

// Socket.io 연결 이벤트 핸들링
io.on('connection', (socket) => {
  console.log(`소켓 연결 성공: ${socket.id}`);

  // 특정 룸 참가 (예: admin)
  socket.on('join', (data: { role: string }) => {
    if (data.role === 'admin') {
      socket.join('admin');
      console.log(`소켓 ${socket.id}가 관리자(admin) 룸에 참가했습니다.`);
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
