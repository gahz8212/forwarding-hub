# 1. 빌드 스테이지
FROM node:20-alpine AS builder
WORKDIR /app

# Puppeteer 크롬 다운로드 건너뛰기 (알파인 리눅스 호환 문제 방지)
ENV PUPPETEER_SKIP_DOWNLOAD=true

# 패키지 파일 복사 및 설치 (타입스크립트 등 devDependencies 포함)
COPY package*.json ./
RUN npm ci

# 소스 코드 복사 및 빌드
COPY . .
RUN npm run build

# 2. 실행 스테이지 (경량화)
FROM node:20-alpine
WORKDIR /app

# Alpine용 Chromium 및 필수 폰트/라이브러리 설치 (Puppeteer 실행용)
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

# Puppeteer 환경 변수 설정 (설치된 Chromium 경로 지정)
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# 프로덕션 의존성만 설치
COPY package*.json ./
RUN npm ci --omit=dev

# 빌드된 결과물 복사
COPY --from=builder /app/dist ./dist

# Cloud Run은 포트를 환경변수(PORT)로 자동 주입함
EXPOSE 8080

# 컴파일된 자바스크립트 실행
CMD ["node", "dist/app.js"]