# Forwarding-Hub MVP Prototype Setup Guide

## 1. 프로젝트 개요
중소 포워딩 업체의 수작업(엑셀, 카톡)을 대체하는 화주용 B/L 트래킹 및 인보이스 관리 대시보드.
- **Phase 1 목표:** 고려해운(KMTC) 웹 스크래핑 기반 실시간 트래킹 + 엑셀 파일 파싱을 통한 스케줄 DB 자동화.

## 2. 기술 스택 (Tech Stack)
- **Frontend:** React (Vite, TypeScript), TailwindCSS, Zustand, React Query
- **Backend:** Node.js (Express, TypeScript), Puppeteer-extra (Stealth), exceljs, jsonwebtoken
- **Database:** MySQL 8.x (Docker Container)

---

## 3. 개발 환경 및 DB 세팅 (Docker)

로컬 개발 환경의 충돌을 방지하기 위해 데이터베이스는 Docker로 격리하여 실행합니다.
프로젝트 루트 디렉토리에 `docker-compose.yml` 파일을 생성합니다.

```yaml
version: '3.8'
services:
  mysql-db:
    image: mysql:8.0
    container_name: forwarding_mysql
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: forwarding_hub
      MYSQL_USER: devuser
      MYSQL_PASSWORD: devpassword
    ports:
      - "3307:3306" # 로컬 포트를 3307로 지정하여 충돌 방지
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  mysql_data:


docker-compose up -d


mkdir backend && cd backend
npm init -y
npm install express cors dotenv mysql2 exceljs puppeteer puppeteer-extra puppeteer-extra-plugin-stealth cookie-parser jsonwebtoken
npm install -D typescript @types/node @types/express @types/cors @types/cookie-parser @types/jsonwebtoken ts-node nodemon
npx tsc --init

backend/
├── src/
│   ├── config/       # DB 연결 및 환경 변수 설정
│   ├── controllers/  # API 라우트 컨트롤러
│   ├── services/     # 비즈니스 로직 (KMTC 스크래핑, 엑셀 파싱)
│   ├── middlewares/  # JWT 검증 로직 등
│   └── app.ts        # Express 진입점
├── .env
└── package.json

PORT=5000
DB_HOST=localhost
DB_PORT=3307
DB_USER=devuser
DB_PASSWORD=devpassword
DB_NAME=forwarding_hub
JWT_SECRET=your_super_secret_key_here
JWT_REFRESH_SECRET=your_super_refresh_secret_key_here


cd ..
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install


npm install zustand @tanstack/react-query axios react-router-dom lucide-react
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p


/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#1e293b',
          blue: '#2563eb',
          light: '#f8fafc'
        }
      }
    },
  },
  plugins: [],
}

frontend/
├── src/
│   ├── api/          # Axios 인스턴스 및 API 호출 함수
│   ├── components/   # 공통 UI 컴포넌트 (버튼, 모달, 테이블 등)
│   ├── pages/        # 라우트별 페이지 (AdminDashboard, ClientTracking 등)
│   ├── store/        # Zustand 상태 관리 스토어 (useAuthStore.ts, useTrackingStore.ts)
│   └── App.tsx       # 라우터 설정
└── package.json

