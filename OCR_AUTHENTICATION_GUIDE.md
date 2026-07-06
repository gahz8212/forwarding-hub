# 🔑 Google Vision API 인증 및 다중 PC 환경 설정 가이드

본 문서는 노트북 등 일부 개발 환경에서 구글 클라우드 조직 정책(`iam.disableServiceAccountKeyCreation`) 제약으로 인해 서비스 계정 JSON 키 발급이 차단되었을 때의 대응 방법 및 다중 PC 환경에서의 설정법을 설명합니다.

---

## 🚫 1. 발생 에러 및 원인
* **에러 메시지**: `적용된 조직 정책 ID: iam.disableServiceAccountKeyCreation`
* **원인**: 보안상 이유로 조직 정책 관리자가 서비스 계정의 외부 JSON 키(비밀키) 생성을 금지한 경우입니다.
* **해결책**: 서비스 계정 키 파일 대신 **로컬 사용자 계정 로그인 정보(ADC, Application Default Credentials)**를 활용하여 우회 인증합니다.

---

## 💻 2. PC 환경별 설정 방법 (코드 수정 필요 없음)

백엔드 서버 코드([ocrService.ts](file:///home/gahz8212/forwarding-hub/backend/src/services/ocrService.ts))가 일반 키 방식과 사용자 인증 방식을 모두 지원하도록 고도화되어 있으므로, 개발 환경에 맞춰 **`backend/.env` 파일의 환경 변수만 변경**해 주시면 됩니다.

### Case A. 일반 PC (조직 정책 제약이 없는 경우 - 권장)
서비스 계정 JSON 키 파일을 프로젝트 내부에서 바로 로드하여 구동하는 가장 표준적인 방법입니다.

1. GCP 콘솔에서 서비스 계정의 JSON 키를 발급받아 다운로드합니다.
2. 다운로드받은 키 파일을 `backend/` 폴더에 `google-credentials.json` 이름으로 배치합니다.
3. `backend/.env` 파일의 설정을 다음과 같이 초기화합니다.
   ```env
   # Google Vision API Credentials (프로젝트 상대경로 사용)
   GOOGLE_APPLICATION_CREDENTIALS="google-credentials.json"
   ```

### Case B. 보안 PC (노트북 등 조직 정책 제약이 있는 경우)
노트북 등 보안 제약이 걸려 키 파일 발급이 막힌 경우, VS Code 확장 프로그램 또는 gcloud CLI 로그인을 활용해 로컬 PC 인증 정보로 우회합니다.

1. 새 PC 환경에서 gcloud CLI 또는 VS Code 구글 확장 프로그램(Google Cloud Code 등) 로그인을 마쳐 로컬 인증을 확보합니다.
2. `backend/.env` 파일에 해당 PC의 **인증 정보 파일 실제 경로**와 **대상 GCP 프로젝트 ID**를 지정합니다.
   
   * **Windows WSL (Linux 배포판) 환경 예시**:
     ```env
     GOOGLE_APPLICATION_CREDENTIALS="/mnt/c/Users/[Windows사용자이름]/AppData/Local/google-vscode-extension/auth/application_default_credentials.json"
     GOOGLE_CLOUD_PROJECT="forwarding-ocr"
     ```
   * **일반 Linux / macOS 환경 예시**:
     ```env
     GOOGLE_APPLICATION_CREDENTIALS="/home/[사용자이름]/.config/gcloud/application_default_credentials.json"
     GOOGLE_CLOUD_PROJECT="forwarding-ocr"
     ```

---

## 💡 주요 동작 원리
* `ocrService` 내부에서 해당 키 파일을 파싱하여 `authorized_user` 타입(사용자 로그인 토큰)일 경우, `GOOGLE_CLOUD_PROJECT` 변수에 기입된 프로젝트 ID(`forwarding-ocr`)를 할당량 검사 대상(`quota_project_id`)으로 메모리상에서 동적 주입해 줍니다.
* 이를 통해 Google Cloud API 서버가 올바른 프로젝트를 대상으로 과금/할당량 체크를 수행하게 되어 오류 없이 정상적으로 이미지 텍스트 추출이 작동하게 됩니다.
