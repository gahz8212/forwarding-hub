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

echo "1. GitHub Provider(OIDC)를 생성합니다..."
CMD=(gcloud iam workload-identity-pools providers create-oidc "$PROV")
CMD+=(--project="$PROJ")
CMD+=(--location="$LOC")
CMD+=(--workload-identity-pool="$POOL")
CMD+=(--display-name="$NAME")
CMD+=(--attribute-mapping="$MAP")
CMD+=(--issuer-uri="$URI")

"${CMD[@]}"

echo -e "\n2. GitHub Secret(WIF_PROVIDER)에 등록할 값을 출력합니다..."
DESC_CMD=(gcloud iam workload-identity-pools providers describe "$PROV")
DESC_CMD+=(--project="$PROJ")
DESC_CMD+=(--location="$LOC")
DESC_CMD+=(--workload-identity-pool="$POOL")
DESC_CMD+=(--format="value(name)")

"${DESC_CMD[@]}"
