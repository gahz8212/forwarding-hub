# 1. 빌드 스테이지
FROM node:20-alpine AS builder
WORKDIR /app

# 패키지 파일 복사 및 설치 (타입스크립트 등 devDependencies 포함)
COPY package*.json ./
RUN npm ci

# 소스 코드 복사 및 빌드
COPY . .
RUN npm run build

# 2. 실행 스테이지 (경량화)
FROM node:20-alpine
WORKDIR /app

# 프로덕션 의존성만 설치
COPY package*.json ./
RUN npm ci --omit=dev

# 빌드된 결과물 복사
COPY --from=builder /app/dist ./dist

# Cloud Run은 포트를 환경변수(PORT)로 자동 주입함
EXPOSE 8080

# 컴파일된 자바스크립트 실행 (package.json의 시작 스크립트에 맞게 수정 가능)
CMD ["node", "dist/app.js"]