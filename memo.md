# Forwarding Hub 개발 진행 상황 메모

## 1. 회원가입 기능 추가
- **프론트엔드 (`App.tsx`)**: 기존 로그인 폼에 '회원가입' 모드를 추가하여 `username`, `password`, `mobile(휴대전화)` 값을 입력받도록 UI 구현
- **백엔드 (`authController.ts`, `authRoutes.ts`)**: 클라이언트에서 넘어온 정보를 받아 데이터베이스에 저장하는 `/api/auth/register` API 엔드포인트 구현
- **데이터베이스 (`init-db.ts`)**: `users` 테이블 스키마에 `mobile VARCHAR(20)` 컬럼 추가 및 방어 로직(`ALTER TABLE`) 작성

## 2. 카카오 로그인 및 메시지 전송 (테스트용 무료 API) 연동
개발 단계에서 비용 없이 지정된 유저(본인 및 팀원)에게 카카오톡 메시지를 보내기 위해 **카카오 디벨로퍼스(Kakao Developers)**의 '나에게 보내기 / 친구에게 보내기' API를 활용했습니다. (상용 서비스 시에는 전화번호 기반의 알림톡 중계사 서비스로 전환 예정)

- **카카오 로그인 버튼 추가 (`App.tsx`)**:
  - 유저가 '카카오로 시작하기'를 누르면 `kauth.kakao.com`으로 이동하여 로그인 및 권한 동의(메시지 전송, 프로필 이름) 수행.
  - 명시적으로 `scope=talk_message,profile_nickname` 옵션을 추가하여 닉네임과 메시지 권한을 완벽히 얻어냄.
- **콜백 및 토큰 저장 (`authController.ts`)**:
  - 카카오 로그인 후 전달받은 `code`를 사용해 카카오 Access Token 발급 (`axios` 사용).
  - 유저의 카카오 프로필 닉네임을 가져와 DB에 임시 가입시키고, 해당 세션에 `kakaoToken`을 저장.
- **리다이렉트 포트 수정**:
  - 백엔드(5000)에서 인증 처리 후 프론트엔드(Vite) 포트인 `http://localhost:5173/`으로 정확히 돌려보내도록 수정하여 "사이트에 연결할 수 없음" 에러 해결.
- **환경 변수(.env) 세팅**:
  - 프론트엔드: `VITE_KAKAO_REST_API_KEY`
  - 백엔드: `KAKAO_REST_API_KEY`

## 3. 선박 스케줄 부킹 요청 시 카카오톡 발송 로직
- **백엔드 (`scheduleController.ts`, `scheduleRoutes.ts`)**:
  - `/api/schedules/book` POST 라우트 생성
  - 세션에 저장되어 있던 `kakaoToken`을 사용해 `https://kapi.kakao.com/v2/api/talk/memo/default/send` 엔드포인트로 스케줄 정보(선박명, 경로, 일정)를 카카오톡 메시지로 발송하는 로직 구현.
- **프론트엔드 연동 (`App.tsx`)**:
  - 대시보드의 스케줄 추천 화면에서 [부킹 요청] 버튼 클릭 시 해당 선박 스케줄 데이터를 백엔드로 전송하고 알림을 발생시키도록 연결.

## 4. 트러블슈팅(Troubleshooting) 요약
- **TypeScript 문법 오류 (TS1127, TS1160)**: 백틱(`) 이스케이프 문자(`\`) 오류 제거.
- **AXIOS 401 Unauthorized (KOE010)**: 쿼리 파라미터 대신 `URLSearchParams`를 사용하여 Body 폼 데이터 형식으로 전송하여 카카오 인증 규격 맞춤 및 `.env` 설정 반영.
- **Nickname Undefined**: 프로필 정보 동의가 안 된 경우를 대비하여 `kakao_user_{id}`로 Fallback 처리. 이후 `scope` 파라미터를 강제하여 동의 창을 다시 띄움으로써 해결.
- **DB INSERT 에러**: `mobile` 컬럼이 추가되었으나 값이 없어 발생한 에러를 쿼리에서 강제로 빈 문자열(`""`)을 넣도록 하여 해결.
