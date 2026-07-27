# Vercel／Firebase／Azure／Cloud Run 部署手冊

以下命令中的專案、帳號與區域名稱請替換成實際值。正式資料服務建議位於 Google Cloud `asia-east1`；Vercel 已設定 `hnd1`。

## 1. Firebase

1. 建立已綁計費帳戶的 Firebase／Google Cloud 專案。
2. 啟用 Email/Password Authentication，不啟用公開註冊頁。
3. 建立 Firestore Native database，位置選 `asia-east1`。
4. 建立 Firebase Storage bucket。
5. 安裝 Firebase CLI 後部署規則：

```bash
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes,storage
```

建立供 Vercel 使用的 service account JSON，轉成單行 base64 後放入 `FIREBASE_SERVICE_ACCOUNT_BASE64`。最小權限需涵蓋 Firebase Authentication 管理、Firestore、Storage 物件簽名／管理，以及下方 Cloud Run 呼叫。

將 Web App 設定填入所有 `NEXT_PUBLIC_FIREBASE_*` 變數。bucket 名稱必須是完整 bucket，不含 `gs://`。

## 2. Cloud Run emotion2vec

模型容器約 90M 參數，首次部署會下載模型。正式服務應限制為需驗證呼叫，並讓服務帳號只讀研究音檔 bucket。

```bash
gcloud run deploy adventure-diary-emotion \
  --source cloud-run/emotion-service \
  --project YOUR_PROJECT_ID \
  --region asia-east1 \
  --service-account adventure-diary-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --cpu 4 \
  --memory 16Gi \
  --concurrency 1 \
  --timeout 60 \
  --no-allow-unauthenticated \
  --set-env-vars MODEL_ID=iic/emotion2vec_plus_base,MODEL_HUB=hf
```

把服務 URL 放入 Vercel 的 `EMOTION_SERVICE_URL`。Vercel service account 需有該服務的 Cloud Run Invoker；應用會用同一份 service account JSON 產生 ID token。只有無法使用 IAM 時才設定額外的 `EMOTION_SERVICE_TOKEN`。

以 20 秒真實 iPad WAV 暖機測試 p95。CPU p95 超過 5 秒時，再依配額與權利條件將同一容器部署到 `asia-southeast1` L4；API 不變。

## 3. Cloud Run WAV export job

```bash
gcloud run jobs deploy adventure-diary-export \
  --source cloud-run/export-job \
  --project YOUR_PROJECT_ID \
  --region asia-east1 \
  --service-account adventure-diary-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --cpu 2 \
  --memory 4Gi \
  --task-timeout 3600s \
  --max-retries 1
```

job service account 需要 Firestore read/write、Storage object read/write。Vercel service account 需要 Cloud Run Jobs Executor。Vercel 設定：

```text
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
CLOUD_RUN_EXPORT_REGION=asia-east1
CLOUD_RUN_EXPORT_JOB_NAME=adventure-diary-export
```

CSV／JSON 會立即建立；WAV ZIP 由 job 背景處理並更新 `exports/{exportId}`。`GET /api/admin/export?exportId=...` 只在 ready 後回傳五分鐘短效 ZIP 連結。

## 4. Azure

建立 Azure Speech 資源，填入：

```text
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=eastasia
```

瀏覽器永遠只收到短效 token。Speech SDK 使用 `en-US`／`zh-TW` 候選語言、詳細輸出與自由口說 Pronunciation Assessment。

建立 Azure OpenAI `gpt-5-mini` 部署，填入 endpoint、key、deployment 與固定 API version。正式測試前確認該部署支援 JSON Schema Structured Outputs 及至少 40 人所需並行額度。

## 5. Vercel

匯入此資料夾或 Git repository，Framework Preset 選 Next.js。把 `.env.example` 內的變數加入 Production／Preview，正式環境務必設定：

```text
NEXT_PUBLIC_DEMO_MODE=false
```

部署前在本機執行：

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

部署後先驗證 `/api/speech/token` 不會回傳 subscription key，Vercel logs 也不得加入逐字稿、模型提示或簽名 URL。

## 6. 第一個研究者與受試者

在安全的管理工作站載入正式環境變數後執行：

```bash
npm run bootstrap:researcher -- RESEARCHER-01 "replace-with-strong-password"
```

研究者登入後，從後台上傳 `samples/participants.csv` 格式的名單。未填 `consentVersion`／`consentedAt` 的帳號不能開始場次。每位學生首次開始時會在班級內以 4 或 6 的隨機區塊做 1:1 分派，分派後不再變更。

在「研究設定」上傳正式 1200 單字 CSV/TXT；系統會建立不可變版本，新場次才使用新版本，既有場次不變。

## 7. 上線驗收

- 在 iPad Safari 測試麥克風權限、AudioWorklet、直／橫向、鎖屏／背景切換。
- 關閉網路錄音，重新整理後恢復網路，確認同一 `attemptId` 只出現一次。
- 用兩位學生驗證跨帳號 Storage 路徑被 rules 拒絕。
- 驗證 Agent 1 的 attempt 沒有 emotion2vec 呼叫／欄位。
- 40 台裝置同時停止錄音，量測暖機狀態判定 p95 ≤ 8 秒、emotion2vec p95 ≤ 5 秒。
- 驗證 CSV、JSON、WAV ZIP、五分鐘音檔連結、刪除 audit log 與研究註記。

目前程式碼與單元測試已就緒；上述雲端配額、真機及 40 人 p95 必須在提供正式資源後完成，不能由本機 Demo Mode 代替。
