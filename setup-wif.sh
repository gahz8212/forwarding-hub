#!/bin/bash
PROV="github-provider"
PROJ="forwarding-ocr"
POOL="github-actions-pool"
LOC="global"
NAME="GitHub Provider"

M1="google.subject=assertion.sub"
M2="attribute.actor=assertion.actor"
M3="attribute.repository=assertion.repository"
MAP="${M1},${M2},${M3}"

URI="https://token.actions.githubusercontent.com"
COND="assertion.repository == 'gahz8212/forwarding-hub'"

echo "0. Workload Identity Pool을 생성합니다 (이미 존재하면 넘어갑니다)..."
POOL_CMD=(gcloud iam workload-identity-pools create "$POOL")
POOL_CMD+=(--project="$PROJ")
POOL_CMD+=(--location="$LOC")
POOL_CMD+=(--display-name="GitHub Actions Pool")
"${POOL_CMD[@]}"

echo "1. GitHub Provider(OIDC)를 생성합니다..."
CMD=(gcloud iam workload-identity-pools providers create-oidc "$PROV")
CMD+=(--project="$PROJ")
CMD+=(--location="$LOC")
CMD+=(--workload-identity-pool="$POOL")
CMD+=(--display-name="$NAME")
CMD+=(--attribute-mapping="$MAP")
CMD+=(--attribute-condition="$COND")
CMD+=(--issuer-uri="$URI")

"${CMD[@]}"

echo -e "\n2. GitHub Secret(WIF_PROVIDER)에 등록할 값을 출력합니다..."
DESC_CMD=(gcloud iam workload-identity-pools providers describe "$PROV")
DESC_CMD+=(--project="$PROJ")
DESC_CMD+=(--location="$LOC")
DESC_CMD+=(--workload-identity-pool="$POOL")
DESC_CMD+=(--format="value(name)")

WIF_PROVIDER=$("${DESC_CMD[@]}")
echo "$WIF_PROVIDER"

echo -e "\n3. 서비스 계정과 WIF를 연결(IAM Binding)합니다..."
SA_EMAIL="github-actions-deploy@forwarding-ocr.iam.gserviceaccount.com"
REPO="gahz8212/forwarding-hub"

# POOL_ID는 providers describe 출력값의 세 번째 항목(projects/123456789/...)
POOL_ID=$(echo "$WIF_PROVIDER" | cut -d'/' -f2)

BIND_CMD=(gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL")
BIND_CMD+=(--project="$PROJ")
BIND_CMD+=(--role="roles/iam.workloadIdentityUser")
BIND_CMD+=(--member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${REPO}")

"${BIND_CMD[@]}"

echo -e "\n✅ 모든 설정이 완료되었습니다!"
echo -e "WIF_PROVIDER 값: $WIF_PROVIDER"
