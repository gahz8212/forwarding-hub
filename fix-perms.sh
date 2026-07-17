#!/bin/bash
PROJ="forwarding-hub-502407"
SA="269919807885-compute@developer.gserviceaccount.com"

# Storage Admin
gcloud projects add-iam-policy-binding "$PROJ" \
  --member="serviceAccount:$SA" \
  --role="roles/storage.admin"

# Logging Writer
gcloud projects add-iam-policy-binding "$PROJ" \
  --member="serviceAccount:$SA" \
  --role="roles/logging.logWriter"

echo "✅ 권한 부여 2차 완료!"
