# GCP 배포를 위한 백엔드 코드 수정 가이드 (Codebase Modifications)

기존 로컬 디스크 및 메모리 기반으로 동작하던 시스템을 Cloud Run 및 Cloud Storage 환경에 맞게 전환하기 위한 필수 코드 변경 사항입니다.

---

## 1. 세션 스토어 스토리지 연동 (`backend/src/app.ts`)

Express의 기본 메모리 세션을 `express-mysql-session`을 활용하여 Cloud SQL(MySQL)에 저장하도록 변경합니다. 인스턴스가 확장되더라도 세션이 유지됩니다.

### 변경 사항
* `express-mysql-session`, `mysql2` 모듈 임포트 추가
* DB 커넥션 풀을 활용한 `MySQLStore` 인스턴스 생성
* `session()` 미들웨어의 `store` 속성에 주입

### 적용 코드
```typescript
import express from 'express';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import mysql from 'mysql2/promise';

const app = express();

// 1. MySQL 커넥션 풀 설정 (로컬 환경과 Cloud Run 환경 변수 분기)
const dbOptions = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3307,
  // Cloud Run UNIX 소켓 연결 시 아래 socketPath 사용 (DB_HOST 대신)
  // socketPath: process.env.INSTANCE_UNIX_SOCKET, 
};

const dbPool = mysql.createPool(dbOptions);

// 2. 세션 스토어 초기화
const MySQLStore = MySQLStoreFactory(session as any);
const sessionStore = new MySQLStore({
  clearExpired: true,
  checkExpirationInterval: 900000, // 15분마다 만료된 세션 정리
  expiration: 86400000, // 세션 만료 시간 (1일)
}, dbPool);

// 3. 세션 미들웨어 적용
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  store: sessionStore, // 메모리 대신 DB 스토어 장착
  cookie: {
    secure: process.env.NODE_ENV === 'production', // GCP 배포 시 true (HTTPS)
    httpOnly: true,
    maxAge: 86400000
  }
}));

// CORS 오리진 환경변수 처리 (하드코딩 제거)
import cors from 'cors';
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// ... 나머지 미들웨어 및 라우터 설정 ...

2. 파일 업로드 로직 GCS 연동 (backend/src/routes/fileRoutes.ts & fileController.ts)
로컬 /uploads 디렉토리 대신, @google-cloud/storage SDK를 사용하여 Google Cloud Storage 버킷에 파일을 직접 업로드하도록 변경합니다.

2.1 라우터 설정 (fileRoutes.ts)
디스크 저장을 수행하던 multer.diskStorage를 메모리에 임시 보관하는 multer.memoryStorage로 변경해야 합니다.
import { Router } from 'express';
import multer from 'multer';
import { uploadFileToGCS } from '../controllers/fileController';

const router = Router();

// 중요: Cloud Run은 휘발성 디스크이므로 memoryStorage() 사용
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB 제한 예시
  },
});

router.post('/upload', upload.single('file'), uploadFileToGCS);

export default router;

2.2 컨트롤러 로직 (fileController.ts)
메모리에 올라온 버퍼 데이터를 GCS 버킷으로 스트리밍 업로드합니다.

import { Request, Response } from 'express';
import { Storage } from '@google-cloud/storage';

// GCS 클라이언트 인스턴스화
const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'forwarding-hub-assets';
const bucket = storage.bucket(bucketName);

export const uploadFileToGCS = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '업로드할 파일이 존재하지 않습니다.' });
    }

    // 파일명 중복을 피하기 위해 타임스탬프 추가
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const uniqueFileName = `${Date.now()}-${originalName.replace(/\s+/g, '_')}`;
    const blob = bucket.file(`uploads/${uniqueFileName}`);

    // GCS 버킷으로 스트림 쓰기 생성
    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: req.file.mimetype,
      },
    });

    blobStream.on('error', (err) => {
      console.error('GCS Upload Error:', err);
      res.status(500).json({ message: '파일 업로드 중 서버 오류가 발생했습니다.' });
    });

    blobStream.on('finish', () => {
      // 업로드 성공 시 공개적으로 접근 가능한 URL 생성
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
      
      // TODO: 데이터베이스(Cloud SQL)에 publicUrl 정보 저장하는 비즈니스 로직 추가

      res.status(200).json({
        message: '파일 업로드가 완료되었습니다.',
        url: publicUrl,
      });
    });

    // 버퍼 데이터를 스트림으로 전송
    blobStream.end(req.file.buffer);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '업로드 처리 중 예외가 발생했습니다.' });
  }
};