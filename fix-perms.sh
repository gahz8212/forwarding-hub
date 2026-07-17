#!/bin/bash
PROJ="forwarding-hub-502407"
SA="269919807885-compute@developer.gserviceaccount.com"
ROLE="roles/storage.admin"

CMD=(gcloud projects add-iam-policy-binding "$PROJ")
CMD+=(--member="serviceAccount:$SA")
CMD+=(--role="$ROLE")

"${CMD[@]}"
echo "✅ 권한 부여 완료!"
