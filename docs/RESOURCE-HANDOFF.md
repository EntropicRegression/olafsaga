# 雲端資源開通與交付規格

> 本文件是交給 Firebase、Azure、Cloud Run emotion2vec 與 WAV ZIP 負責人的工作單。
>
> 文件讀者不是網站部署者。請依自己負責的章節建立資源，完成測試後，把「必須交付」欄位安全交給網站部署負責人。

## 1. 這份文件要解決什麼

本系統的網站由部署負責人放到 Vercel，但網站要正常分析及保存學生錄音，還需要四包外部資源：

1. Firebase：登入、Firestore 資料庫、WAV 儲存及伺服器服務帳號。
2. Azure Speech：即時語音辨識與發音評量。
3. Azure OpenAI：語意、情節、語言與文法判定。
4. Google Cloud Run：
   - emotion2vec HTTP Service。
   - WAV ZIP 背景匯出 Job。

各資源可由同一人或不同人負責。每位負責人只需閱讀自己的章節。

完整安裝與命令列操作仍保留在 [部署執行與工具安裝手冊](DEPLOYMENT.md)；本文件以「要開通什麼、完成到什麼程度、最後交付什麼」為主。

---

## 2. 最後要交給部署負責人的總表

以下名稱必須與 Vercel Environment Variables 完全一致。

| 系統 | 必須交付的名稱 | 秘密？ | 範例或說明 |
|---|---|---:|---|
| Firebase | `NEXT_PUBLIC_FIREBASE_API_KEY` | 否 | Firebase Web App 的 `apiKey` |
| Firebase | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | 否 | `project-id.firebaseapp.com` |
| Firebase | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | 否 | Google Cloud Project ID |
| Firebase | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | 否 | 實際 bucket 名稱，不可自行猜測 |
| Firebase | `NEXT_PUBLIC_FIREBASE_APP_ID` | 否 | Firebase Web App 的 `appId` |
| Firebase | `FIREBASE_SERVICE_ACCOUNT_BASE64`，或可轉換成它的 Service Account JSON | **是** | 透過密碼管理器交付 |
| Azure Speech | `AZURE_SPEECH_KEY` | **是** | Speech resource Key 1 或 Key 2 |
| Azure Speech | `AZURE_SPEECH_REGION` | 否 | 例如 `eastasia`，必須與 Key 同一資源 |
| Azure OpenAI | `AZURE_OPENAI_ENDPOINT` | 否 | Azure OpenAI resource endpoint |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` | **是** | 與 Endpoint 同一資源 |
| Azure OpenAI | `AZURE_OPENAI_DEPLOYMENT` | 否 | 模型的 deployment name |
| Azure OpenAI | `AZURE_OPENAI_API_VERSION` | 否 | 本版預設 `2025-04-01-preview` |
| emotion2vec | `EMOTION_SERVICE_URL` | 否 | Cloud Run Service 的 HTTPS 根網址 |
| emotion2vec | `EMOTION_SERVICE_TOKEN` | 視情況 | 使用 Google IAM 驗證時留空 |
| WAV ZIP | `GOOGLE_CLOUD_PROJECT` | 否 | Cloud Run Job 所在 Project ID |
| WAV ZIP | `CLOUD_RUN_EXPORT_REGION` | 否 | 預設 `asia-east1` |
| WAV ZIP | `CLOUD_RUN_EXPORT_JOB_NAME` | 否 | 預設 `adventure-diary-export` |

除了上述值，每一包資源還要交付：

- 資源所在帳號／組織、Project、Subscription、Resource Group 與 Region。
- 資源的 Console 管理網址。
- 計費帳戶已連結、費用警示已設定的確認。
- 部署版本、建立日期、負責人及異常聯絡方式。
- 權限設定與驗收結果。

### 秘密資料如何交付

秘密資料不得放在 Email 內文、LINE、簡報、公開表單、GitHub Issue 或本文件。

請使用單位核准的密碼管理器或 Secret Vault 交付，並做到：

1. 標示秘密對應哪個環境：測試或正式。
2. 標示建立日期及預定輪替日期。
3. 只授權部署負責人讀取。
4. 部署完成後撤銷臨時分享連結。
5. 不交付個人帳號密碼；需要管理權時，用 IAM／RBAC 邀請部署負責人的帳號。

---

## 3. 所有人先確認的共同規格

### 3.1 環境名稱

本文件預設建立正式環境 `production`。如果還會建立測試環境，所有資源必須加上 `staging` 或 `test`，不可讓測試資料進入正式資料庫。

交付時請填：

```text
環境：production / staging
用途：
資料負責單位：
技術負責人：
費用負責人：
異常聯絡方式：
```

### 3.2 帳號所有權

- Firebase、Google Cloud 和 Azure 資源應由學校、研究單位或專案組織持有。
- 不應只存在某位承辦人的私人帳號下。
- 至少要有兩位可恢復管理權的管理者。
- 請替部署負責人的 Google／Microsoft 帳號配置需要的權限，不要分享共用帳號密碼。

### 3.3 區域與資料位置

- Firebase／Firestore／Storage／Cloud Run 預設：`asia-east1`。
- Azure Speech 預設：`eastasia`。
- Azure OpenAI 可以依模型供應及配額選擇可用區域，但交付時必須寫清楚實際 Region。
- 如因校方資料治理政策必須改區域，建立資源前先通知部署負責人。

### 3.4 費用

每個正式資源都必須：

- 綁定有效計費帳戶或 Azure Subscription。
- 建立月預算通知。
- 提供警示收件人。
- 說明是否有自動停用機制；一般預算通知不等於自動停止服務。

---

## 4. 給 Firebase／Google Cloud 負責人

### 4.1 你要建立的資源

請在同一個 Google Cloud Project 內完成：

- Firebase Project。
- Firebase Authentication。
- Cloud Firestore，Native mode，資料庫 ID 使用 `(default)`。
- Firebase Storage bucket。
- Firebase Web App。
- Google Cloud Billing／Firebase Blaze。
- Vercel 使用的 Service Account。
- Cloud Run 使用的 runtime Service Account。
- 必要 Google APIs。

預設位置使用 `asia-east1`。Firestore 與 Storage 建立後通常不能任意更換位置，建立前請確認。

### 4.2 Firebase Authentication

請完成：

- 啟用 Email/Password 登入。
- 不開放使用者自行註冊的公開頁面。
- 學生代碼會由系統內部轉換成假的 Firebase Email，不會收集學生真實 Email。
- 之後收到 Vercel 正式網址時，將該網域加入 Firebase Authentication 的 Authorized domains。

首次交付時可以先沒有 Vercel 網域；部署負責人取得正式網址後會回傳給你完成第二階段設定。

### 4.3 Firestore 與 Storage

請完成：

- Firestore 使用 Native mode。
- Storage 已建立且 Firebase 專案已升級 Blaze。
- 部署本儲存庫的：
  - `firestore.rules`
  - `firestore.indexes.json`
  - `storage.rules`
- 確認瀏覽器不能直接讀寫 Firestore 研究資料。
- 確認學生只可上傳自己的 `audio/{uid}/{sessionId}/{fileName}.wav`。
- 確認只接受 `audio/wav`、單檔大於 44 bytes 且不超過 2 MiB。
- `exports/` 不允許瀏覽器直接讀寫。

規則可由你部署，或授權部署負責人部署。交付時必須說明採用哪一種。

### 4.4 建立兩個 Service Account

#### A. Vercel Service Account

建議名稱：

```text
adventure-diary-vercel@PROJECT_ID.iam.gserviceaccount.com
```

Project 層級需要：

- `roles/firebaseauth.admin`
- `roles/datastore.user`
- `roles/storage.objectAdmin`

Cloud Run 資源建立後，另外需要：

- emotion2vec Service 上的 `roles/run.invoker`
- WAV ZIP Job 上的 `roles/run.jobsExecutor`

這個 Service Account 是 Vercel 伺服器的機器身分。請產生一個 JSON Key，透過安全管道交付；部署負責人會把它轉成單行 Base64，存入：

```text
FIREBASE_SERVICE_ACCOUNT_BASE64
```

若你直接交付 Base64，也要同時交付 Service Account Email、Key ID 與建立日期。

#### B. Cloud Run runtime Service Account

建議名稱：

```text
adventure-diary-runtime@PROJECT_ID.iam.gserviceaccount.com
```

需要：

- `roles/datastore.user`
- `roles/storage.objectAdmin`

此身分由 emotion2vec Service 和 WAV ZIP Job 在 Google Cloud 內直接使用，不需要也不應產生 JSON Key 給 Vercel。

### 4.5 必須啟用的 Google APIs

至少包含：

- Cloud Run Admin API
- Cloud Build API
- Artifact Registry API
- IAM API
- Firestore API
- Cloud Storage API

### 4.6 Firebase 負責人必須交付

請完整填寫，不可只回覆「Firebase 已開好」：

```text
【Firebase 正式環境交付單】

Google Cloud Project 顯示名稱：
Google Cloud Project ID：
Google Cloud Project Number：
Firebase Console URL：
Google Cloud Console URL：
Billing Account 已連結：是 / 否
月預算警示金額：
警示收件人：

Firestore Database ID：(default)
Firestore Region：
Firestore rules 部署日期：
Firestore indexes 部署日期：

Storage bucket 完整名稱：
Storage Region：
Storage rules 部署日期：

Email/Password Authentication：已啟用 / 未啟用
目前 Authorized domains：

NEXT_PUBLIC_FIREBASE_API_KEY：
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN：
NEXT_PUBLIC_FIREBASE_PROJECT_ID：
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET：
NEXT_PUBLIC_FIREBASE_APP_ID：

Vercel Service Account Email：
Vercel Service Account Key ID：
Service Account JSON／Base64 安全保存位置：
Vercel Service Account 已具備的角色：

Cloud Run runtime Service Account Email：
Cloud Run runtime Service Account 已具備的角色：

部署負責人的 Google 帳號已取得的 IAM 權限：
技術負責人：
異常聯絡方式：
```

### 4.7 驗收標準

交付前請確認：

- Firebase Console 可看到 Auth、Firestore、Storage。
- 五個 Firebase Web App 值來自同一個 App。
- Storage bucket 名稱是真實值，不是推測的 `PROJECT_ID.appspot.com`。
- Service Account JSON 可以解析，`project_id` 與正式 Project 相同。
- 規則和 indexes 已成功部署。
- 部署負責人的帳號能依約定查看或管理資源。
- 沒有把 JSON Key 放進 GitHub 或一般文件。

---

## 5. 給 Azure Speech 負責人

### 5.1 你要建立的資源

請建立可供正式網站從公網呼叫的 Azure AI Speech resource。

預設需求：

- Region：`eastasia`；如改用其他 Region，必須先通知。
- 語音辨識語言：`en-US`。
- 候選語言：`en-US`、`zh-TW`。
- 需要 Speech-to-Text、Pronunciation Assessment、Accuracy、Fluency 與 Prosody。
- 需能支援最多約 40 位學生同時使用；請確認配額和並行限制。
- Vercel Function 會使用 Speech Key 換取短效瀏覽器 token。

如果 Azure resource 設為只允許私人網路，Vercel 將無法直接換 token。若單位政策要求封閉網路，請另外提供可供 Vercel 使用的 Proxy 契約。

### 5.2 必須交付

```text
【Azure Speech 正式環境交付單】

Azure Tenant：
Subscription 名稱：
Subscription ID：
Resource Group：
Speech Resource 名稱：
Azure Portal Resource URL：
Region：
Pricing tier：
已確認的並行／配額：
月預算警示金額：
警示收件人：

AZURE_SPEECH_REGION：
AZURE_SPEECH_KEY 的安全保存位置：
交付的是 Key 1 / Key 2：
Key 建立或最近輪替日期：

已測試 Speech token endpoint：是 / 否
已測試 en-US STT：是 / 否
已測試 zh-TW 候選語言：是 / 否
已測試 Accuracy／Fluency／Prosody：是 / 否

技術負責人：
異常聯絡方式：
```

`AZURE_SPEECH_KEY` 必須透過密碼管理器交付，不要貼在這張表。

### 5.3 驗收標準

- Key 和 Region 確定來自同一個 Speech resource。
- 使用該 Key 可以成功取得 Speech authorization token。
- 實測可辨識一段英文語音。
- Pronunciation Assessment 回傳 Accuracy、Fluency 與 Prosody 原始結果。
- 已確認 40 人測試需要的配額；若目前不足，要寫明已申請多少及預計完成日。

---

## 6. 給 Azure OpenAI 負責人

### 6.1 你要建立的資源

請建立 Azure OpenAI／Azure AI Foundry 可用資源及模型部署。

本版程式契約：

```text
模型：gpt-5-mini
建議 deployment name：gpt-5-mini
API version：2025-04-01-preview
輸出：JSON Schema Structured Outputs
```

注意：

- `AZURE_OPENAI_DEPLOYMENT` 是「部署名稱」，不一定等於模型名稱。
- `AZURE_OPENAI_ENDPOINT` 必須是程式可呼叫的 Azure OpenAI resource endpoint，不是 Azure Portal 頁面網址，也不是一般 Foundry 專案頁面網址。
- Key、Endpoint、Deployment 必須屬於相容的同一資源／專案路徑。
- 資源必須允許 Vercel 從公網呼叫；若有網路限制，需提供 Proxy。
- 請確認 Structured Outputs 及指定 API version 在實際模型部署上可用。

### 6.2 配額

請依最多 40 位學生同時送出分析評估 TPM／RPM，並回報：

- Deployment TPM。
- Resource／Region RPM。
- 是否與其他系統共用配額。
- 觸發 429 時的限制值。
- 已申請但尚未核准的配額。

### 6.3 必須交付

```text
【Azure OpenAI 正式環境交付單】

Azure Tenant：
Subscription 名稱：
Subscription ID：
Resource Group：
Azure OpenAI Resource 名稱：
Azure Portal／Foundry Resource URL：
Region：
月預算警示金額：
警示收件人：

模型名稱：
模型版本：
Deployment name：
Deployment TPM：
已確認 RPM：
是否與其他系統共用配額：

AZURE_OPENAI_ENDPOINT：
AZURE_OPENAI_DEPLOYMENT：
AZURE_OPENAI_API_VERSION：
AZURE_OPENAI_API_KEY 的安全保存位置：
Key 建立或最近輪替日期：

Structured Outputs 測試：通過 / 未通過
測試日期：
測試回應狀態碼：
技術負責人：
異常聯絡方式：
```

### 6.4 驗收標準

- 使用交付的 Endpoint、Key、Deployment 與 API version 可收到 HTTP 200。
- 可依指定 JSON Schema 回傳結構化結果。
- 回應不是 HTML Portal 頁面或 404。
- 已確認正式負載配額；不足時有明確的配額申請紀錄。
- API Key 沒有出現在 GitHub、文件或 Email 內文。

---

## 7. 給 Cloud Run emotion2vec 負責人

### 7.1 你會收到的程式

服務原始碼在：

```text
cloud-run/emotion-service/
```

內容包含：

- `Dockerfile`
- `main.py`
- `requirements.txt`

模型預設：

```text
MODEL_ID=iic/emotion2vec_plus_base
MODEL_HUB=hf
```

部署前請確認 emotion2vec 程式及模型授權符合本研究及實際公開部署用途。

### 7.2 要部署成什麼

請部署成「私密 Cloud Run Service」，不是 Cloud Run Job。

建議正式設定：

```text
Service name：adventure-diary-emotion
Region：asia-east1
CPU：4
Memory：16 GiB
Concurrency：1
Request timeout：60 秒
Authentication：Require authentication
Runtime identity：adventure-diary-runtime Service Account
```

正式負載測試前可從 CPU 版開始。若暖機後 20 秒 WAV 的推論 p95 超過 5 秒，請回報測試結果，再評估 GPU 版本。

Vercel 程式本身會在 15 秒後中止 emotion2vec 呼叫，因此冷啟動、下載音檔及推論的總時間不能超過 15 秒。需要時請設定最小 instance 或其他暖機方式，並先說明額外費用。

### 7.3 IAM 與 Storage

請確認：

- Cloud Run runtime Service Account 可以讀取 Firebase Storage bucket 內的 `audio/` WAV。
- Service 維持 private，不開放 unauthenticated。
- Vercel Service Account 在此 Service 上具有 `roles/run.invoker`。
- Vercel 會用 Google ID token 呼叫。
- 正常 IAM 模式下不需要 `EMOTION_SERVICE_TOKEN`，請交付空白值。

若你另外架設會驗證固定 Bearer token 的 Gateway，才需要建立及交付 `EMOTION_SERVICE_TOKEN`，並說明 token 輪替方式。

### 7.4 必須符合的 HTTP 契約

健康檢查：

```http
GET /healthz
```

預期：

```json
{
  "status": "ok",
  "modelVersion": "iic/emotion2vec_plus_base"
}
```

分析：

```http
POST /v1/analyze
Authorization: Bearer <Google ID token>
Content-Type: application/json

{
  "bucket": "實際 Firebase Storage bucket",
  "objectPath": "audio/uid/session-id/attempt-id.wav"
}
```

預期回應：

```json
{
  "scores": [
    { "label": "happy", "score": 0.73 }
  ],
  "modelVersion": "iic/emotion2vec_plus_base",
  "inferenceMs": 1234
}
```

`scores` 必須包含下列九個小寫標籤及數值分數：

```text
angry
disgusted
fearful
happy
neutral
other
sad
surprised
unknown
```

### 7.5 必須交付

```text
【emotion2vec Cloud Run 正式環境交付單】

Google Cloud Project ID：
Google Cloud Project Number：
Cloud Run Service name：
Region：
Cloud Run Console URL：
EMOTION_SERVICE_URL：
EMOTION_SERVICE_TOKEN：空白 / 另由 Secret Vault 交付

Runtime Service Account：
Vercel Service Account：
Vercel SA 的 roles/run.invoker：已設定 / 未設定
Service 對 unauthenticated：禁止 / 允許

Container image URI：
Image digest：
Cloud Run revision：
MODEL_ID：
MODEL_HUB：
CPU／Memory／Concurrency：
Min instances：
Max instances：

/healthz 測試：通過 / 未通過
/v1/analyze 真實 WAV 測試：通過 / 未通過
測試 WAV 秒數：
暖機 inferenceMs：
暖機 p95：
冷啟動總時間：

每月費用警示：
部署日期：
技術負責人：
異常聯絡方式：
```

### 7.6 驗收標準

- 未帶驗證呼叫會收到 401／403。
- Vercel Service Account 的 ID token 可以呼叫。
- Service 可以從正確 bucket 下載私密 WAV。
- 九類標籤完整，名稱和大小寫完全符合契約。
- `inferenceMs` 是數字，`modelVersion` 不是空白。
- 暖機 20 秒 WAV 推論 p95 不超過 5 秒。
- 正式情境下總呼叫不超過 Vercel 端 15 秒限制。

---

## 8. 給 Cloud Run WAV ZIP 負責人

### 8.1 你會收到的程式

Job 原始碼在：

```text
cloud-run/export-job/
```

內容包含：

- `Dockerfile`
- `main.py`
- `requirements.txt`

此工作會：

1. 讀取所有 Firestore `attempts`。
2. 從 Storage 讀取對應 WAV。
3. 建立 `manifest.csv`、`manifest.json` 和 `wav/`。
4. 將 `audio.zip` 上傳到 `exports/{exportId}/`。
5. 更新 Firestore `exports/{exportId}` 狀態。

### 8.2 要部署成什麼

請部署成 Cloud Run Job，不是 HTTP Service。

建議正式設定：

```text
Job name：adventure-diary-export
Region：asia-east1
CPU：2
Memory：4 GiB
Task timeout：3600 秒
Max retries：1
Tasks：1
Runtime identity：adventure-diary-runtime Service Account
```

Cloud Run Job 不支援以 `gcloud run jobs deploy --source` 直接部署。請先用 Cloud Build 建立 container image，再以 `--image` 建立 Job。

### 8.3 執行時參數

以下三個值由 Vercel 每次啟動 Job 時覆寫，不要固定成某一筆匯出：

```text
EXPORT_ID=export-...
EXPORT_PREFIX=exports/export-...
STORAGE_BUCKET=實際 Firebase Storage bucket
```

沒有這三個值時直接手動執行 Job 會失敗，這是正常保護行為。

### 8.4 IAM

請確認：

- Runtime Service Account 有 `roles/datastore.user`。
- Runtime Service Account 有 `roles/storage.objectAdmin`。
- Vercel Service Account 在該 Job 上有 `roles/run.jobsExecutor`。
- Job 不需要 Service Account JSON Key；它使用 Cloud Run runtime identity。

### 8.5 必須交付

```text
【WAV ZIP Cloud Run Job 正式環境交付單】

GOOGLE_CLOUD_PROJECT：
CLOUD_RUN_EXPORT_REGION：
CLOUD_RUN_EXPORT_JOB_NAME：
Cloud Run Job Console URL：

Runtime Service Account：
Vercel Service Account：
Vercel SA 的 roles/run.jobsExecutor：已設定 / 未設定

Artifact Registry repository：
Container image URI：
Image digest：
Job revision／更新日期：
CPU／Memory／Timeout／Retries：

測試 exportId：
測試 execution name：
執行結果：成功 / 失敗
Storage ZIP object path：
ZIP 內含 manifest.csv：是 / 否
ZIP 內含 manifest.json：是 / 否
ZIP 內含 WAV：是 / 否
Firestore exports 狀態更新為 ready：是 / 否
測試 ZIP 可由後台取得五分鐘短效連結：是 / 否

每月費用警示：
技術負責人：
異常聯絡方式：
```

### 8.6 驗收標準

- Vercel Service Account 可以透過 Cloud Run v2 API 啟動 Job。
- 其他未授權身分不能執行 Job。
- Job 能讀 Firestore、讀 WAV、寫 ZIP、更新 export 狀態。
- ZIP 可正常解壓縮，且路徑和 manifest 不損壞。
- 大量檔案時仍能在 3600 秒內完成；若不能，要回報實測筆數、總容量和時間。
- Job 失敗時 Firestore 會留下 `wavZipStatus=error` 與錯誤內容。

---

## 9. 兩階段交接流程

### 第一階段：Vercel 部署前

各負責人先交付：

- Firebase 五個 Web App 值。
- Firebase Service Account JSON／Base64。
- Azure Speech Key 與 Region。
- Azure OpenAI Endpoint、Key、Deployment、API version。
- emotion2vec URL 和 IAM 完成證明。
- WAV ZIP 的 Project、Region、Job name 和 IAM 完成證明。

部署負責人會把值放進 Vercel，而不是放進 GitHub。

### 第二階段：取得 Vercel 正式網址後

部署負責人回傳：

```text
Vercel Production URL：
自訂網域（如有）：
```

Firebase 負責人再完成：

- 將 Vercel 網域加入 Firebase Authentication Authorized domains。
- 若有網路 allowlist，加入需要的正式來源。

之後由部署負責人執行端到端驗收。

---

## 10. 部署負責人收到資料後的核對表

- [ ] 收到的 Project／Subscription 都是正式環境。
- [ ] 所有 Region 已寫清楚。
- [ ] Firebase 五個 Web App 值屬於同一個 App。
- [ ] Service Account JSON 的 `project_id` 正確。
- [ ] Azure Speech Key 與 Region 成對。
- [ ] Azure OpenAI Endpoint、Key、Deployment、API version 已共同測試。
- [ ] emotion2vec URL 是 HTTPS 根網址，不含 `/v1/analyze`。
- [ ] emotion2vec 使用 IAM 時，`EMOTION_SERVICE_TOKEN` 留空。
- [ ] WAV ZIP 的 Project、Region、Job name 與 Console 一致。
- [ ] 所有秘密都來自 Secret Vault，不在一般文件。
- [ ] 已收到管理權限或明確的異常處理窗口。
- [ ] 已收到費用、配額和輪替負責人。
- [ ] 已收到四包資源的驗收結果。

Vercel 正式環境最後應填：

```text
NEXT_PUBLIC_DEMO_MODE=false

NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_SERVICE_ACCOUNT_BASE64=

AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=

AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=
AZURE_OPENAI_API_VERSION=2025-04-01-preview

EMOTION_SERVICE_URL=
EMOTION_SERVICE_TOKEN=

GOOGLE_CLOUD_PROJECT=
CLOUD_RUN_EXPORT_REGION=
CLOUD_RUN_EXPORT_JOB_NAME=
```

---

## 11. 資源負責人不需要交付的東西

請不要交付：

- 個人 Google、Microsoft 或 Azure 帳號密碼。
- Firebase Console 的共用帳號。
- Cloud Run runtime Service Account 的 JSON Key。
- 學生真實姓名或研究資料。
- 貼在 Email、聊天或 GitHub 裡的明文秘密。
- 只有截圖、沒有可複製實際值的設定。
- 沒有 Project／Region／資源名稱的單一 Key。

正確做法是交付可追蹤的資源、最小必要權限、可安全輪替的 Key，以及填妥的交付單。

---

## 12. 官方參考

- [Firebase Web App 設定](https://firebase.google.com/docs/web/setup)
- [Firebase Admin SDK 與 Service Account](https://firebase.google.com/docs/admin/setup)
- [Firebase Storage 計費要求](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
- [Cloud Run Service 部署](https://cloud.google.com/run/docs/deploying)
- [Cloud Run 服務對服務驗證](https://cloud.google.com/run/docs/authenticating/service-to-service)
- [Cloud Run Jobs](https://cloud.google.com/run/docs/create-jobs)
- [Azure Speech Regions](https://learn.microsoft.com/azure/ai-services/speech-service/regions)
- [Azure OpenAI 模型部署](https://learn.microsoft.com/azure/foundry-classic/openai/how-to/create-resource)
- [Azure OpenAI Structured Outputs](https://learn.microsoft.com/azure/foundry/openai/how-to/structured-outputs)
- [Azure OpenAI 配額](https://learn.microsoft.com/azure/ai-services/openai/quotas-limits)

