#!/bin/bash
gcloud builds log aad1fef6-da9d-46f7-90a4-64c1fde09454 --project="forwarding-hub-502407" --region="asia-northeast3" | tail -n 50
