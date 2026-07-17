#!/bin/bash
SA="github-actions-deploy@forwarding-hub-502407.iam.gserviceaccount.com"
PROJ="forwarding-hub-502407"
ROLE="roles/iam.workloadIdentityUser"
MEMBER="principalSet://iam.googleapis.com/181298989162/attribute.repository/gahz8212/forwarding-hub"

CMD=(gcloud iam service-accounts add-iam-policy-binding "$SA")
CMD+=(--project="$PROJ")
CMD+=(--role="$ROLE")
CMD+=(--member="$MEMBER")

"${CMD[@]}"
echo "✅ IAM Binding 완료!"
