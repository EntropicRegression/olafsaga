# 部署執行與工具安裝手冊（部署負責人用）

> 如果你是 Firebase、Azure、Cloud Run emotion2vec 或 WAV ZIP 的資源負責人，請改看 [雲端資源開通與交付規格](RESOURCE-HANDOFF.md)。該文件會告訴你要建立什麼，以及最後必須交給部署負責人的資料。

本手冊以 Windows 電腦、PowerShell、GitHub 與 Vercel 為例。照順序完成即可，不需要先懂程式。

> 最重要的觀念：這個系統分成「網站畫面」和「外部分析服務」。
> 只部署 Vercel 可以展示畫面與模擬流程；Firebase、Azure 與 Cloud Run 全部接好後，才是真實研究模式。

---

## 先決定要部署哪一種

### A. 只做介面預覽

適合展示畫面、測試操作流程，不可拿 Demo 分數當研究資料。

只需要：

- GitHub 帳號
- Vercel 帳號
- 專案程式碼

Vercel 環境變數只要：

```text
NEXT_PUBLIC_DEMO_MODE=true
```

Demo 模式會使用瀏覽器本機儲存及模擬評量。不同電腦之間看不到彼此的資料。

### B. 正式研究模式

適合保存真實 WAV、逐字稿、分數、情緒分析與研究匯出。

需要：

- GitHub
- Vercel
- Firebase／Google Cloud
- Google Cloud 計費帳戶
- Microsoft Azure 訂閱
- Azure Speech
- Azure OpenAI／Microsoft Foundry 模型部署
- Cloud Run emotion2vec 服務
- Cloud Run WAV ZIP 匯出工作
- 正式受試者名單、研究同意版本及 1200 單字檔

---

## 第一部分：需要申請哪些帳號與資源

建議所有正式帳號都用「學校／研究單位擁有的 Email」申請，不要長期放在開發者私人帳號。

| 項目 | 用途 | 是否可能收費 | 最後應由誰持有 |
|---|---|---:|---|
| GitHub 帳號與 Private Repository | 保存程式碼與版本紀錄 | 可先免費 | 研究單位 |
| Vercel 帳號／Team／Project | 部署學生網站與研究後台 | Demo 可用 Hobby；正式建議 Pro | 研究單位 |
| Google 帳號 | 管理 Firebase 與 Google Cloud | 帳號免費 | 研究單位 |
| Google Cloud Billing Account | Firebase Storage、Cloud Run 與映像建置計費 | 是 | 研究單位財務負責人 |
| Firebase Project | 帳號、資料庫、WAV 儲存 | Blaze 隨用隨付 | 研究單位 |
| Microsoft 帳號與 Azure Subscription | 使用 Speech 與 Azure OpenAI | 是 | 研究單位 |
| Azure Speech Resource | 語音轉文字、Accuracy、Fluency、Prosody | 是 | 研究單位 |
| Azure OpenAI／Foundry Resource | 情節、感受與文法語意分析 | 是 | 研究單位 |
| 網域名稱（非必要） | 例如 `study.example.edu.tw` | 視網域而定 | 研究單位 |

Firebase Storage 現在必須使用 Blaze 隨用隨付方案；Blaze 仍可能包含免費用量，但一定要先綁計費帳戶。[Firebase 官方說明](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)

### 帳號安全先做

所有主要帳號都應：

1. 開啟雙因素驗證。
2. 至少設定兩位研究單位管理員，避免只有一人能登入。
3. 設定 Google Cloud 與 Azure 的費用預算警示。
4. 不用 Email、LINE 或一般聊天訊息傳送 API Key。
5. 使用密碼管理器交接密碼與金鑰。

Google Cloud 和 Azure 的「預算」只會發出警告，不會自動停止服務或停止收費。[Google Cloud 預算說明](https://cloud.google.com/billing/docs/how-to/budgets)、[Azure 預算說明](https://learn.microsoft.com/azure/cost-management-billing/costs/tutorial-acm-create-budgets)

---

## 第二部分：電腦要安裝什麼

以下工具安裝在「負責部署的 Windows 電腦」，不是安裝在 Vercel。

| 軟體 | 安裝在哪裡 | 用途 | 是否必要 |
|---|---|---|---:|
| Node.js 22 以上 | 部署人員的電腦 | 安裝套件、測試、建立研究者帳號 | 必要 |
| GitHub Desktop | 部署人員的電腦 | 不用打 Git 指令也能上傳程式碼 | 建議 |
| Google Cloud CLI | 部署人員的電腦 | 建立 Cloud Run、服務帳號與權限 | 正式模式必要 |
| Firebase CLI | 部署人員的電腦 | 部署 Firestore／Storage 安全規則 | 正式模式必要 |
| VS Code | 部署人員的電腦 | 查看設定檔與錯誤 | 非必要但建議 |
| Docker Desktop | 不用安裝 | 本手冊使用 Google Cloud 線上建置容器 | 不需要 |

### 1. 安裝 Node.js

從 [Node.js 官方網站](https://nodejs.org/) 安裝 Node.js 22 以上版本。安裝後重新開啟 PowerShell：

```powershell
node --version
npm.cmd --version
```

第一行應顯示 `v22`、`v24` 或更高版本。

### 2. 安裝 GitHub Desktop

從 [GitHub Desktop](https://desktop.github.com/) 安裝並登入研究單位的 GitHub 帳號。它可以用圖形介面管理現有專案。[GitHub Desktop 官方入門](https://docs.github.com/desktop/overview/creating-your-first-repository-using-github-desktop)

### 3. 安裝 Google Cloud CLI

下載並執行 [Google Cloud CLI Windows 安裝程式](https://cloud.google.com/sdk/docs/install)。Windows 版本會自行安裝需要的 Python。

安裝後重新開啟 PowerShell：

```powershell
gcloud --version
gcloud auth login
```

瀏覽器會開啟，請用管理 Firebase 的 Google 帳號登入。

### 4. 安裝 Firebase CLI

```powershell
npm.cmd install -g firebase-tools
firebase --version
firebase login
```

Firebase CLI 官方也提供 Windows 獨立安裝檔；本專案已經有 `firebase.json`，不需要重新執行 `firebase init`。[Firebase CLI 官方文件](https://firebase.google.com/docs/cli)

---

## 第三部分：先確認專案在本機正常

在 PowerShell 執行：

```powershell
cd C:\Users\User\Desktop\olafsaga
npm.cmd install
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

最後看到 `Compiled successfully` 代表程式可以部署。

本機預覽：

```powershell
npm.cmd run dev
```

打開 `http://localhost:3000`。

---

## 第四部分：把程式碼放到 GitHub

推薦建立 Private Repository，避免研究系統原始碼與設定被不必要地公開。

### 使用 GitHub Desktop

1. 開啟 GitHub Desktop。
2. 選擇 `File` → `Add local repository`。
3. 選擇：

   ```text
   C:\Users\User\Desktop\olafsaga
   ```

4. 如果顯示這不是 Git repository，選擇在此建立 repository。
5. Repository 名稱可填 `adventure-diary-study`。
6. 建立第一個 commit，例如 `Initial research prototype`。
7. 點擊 `Publish repository`。
8. 勾選 `Keep this code private`。

上傳前確認 GitHub 裡沒有以下內容：

- `.env`
- `.env.local`
- 任何 service account JSON
- Azure API Key
- 真實受試者名單
- `node_modules`

本專案的 `.gitignore` 已排除環境變數與 `node_modules`，但仍應人工再檢查一次。

---

## 第五部分：先部署 Vercel Demo

這一步可以先確認「網站本身」沒有問題。

1. 到 [Vercel](https://vercel.com/) 建立帳號。
2. 建議使用剛才的 GitHub 帳號登入。
3. 點 `Add New` → `Project`。
4. 找到剛才的 Private Repository，點 `Import`。
5. 確認：

   | 設定 | 值 |
   |---|---|
   | Framework Preset | Next.js |
   | Root Directory | 留空或 repository 根目錄 |
   | Build Command | `npm run build` |
   | Output Directory | 留空 |
   | Node.js | 22 以上 |

6. 在 `Environment Variables` 加入：

   ```text
   NEXT_PUBLIC_DEMO_MODE=true
   ```

7. 點 `Deploy`。
8. 等 Vercel 顯示 `Ready`。
9. 打開 Vercel 提供的 `https://...vercel.app` 網址。

Vercel 可以直接從 GitHub repository 建立 Project，後續 push 到主分支也會自動重新部署。[Vercel Git 部署文件](https://vercel.com/docs/git)

Demo 測試帳號：

- `ANNA-021`：Agent 1
- `ANNA-022`：Agent 2
- `RESEARCHER-DEMO`：研究後台
- 不需密碼

> 到這裡只有 Demo。接下來才是正式資料與 AI 分析設定。

---

## 第六部分：建立 Firebase／Google Cloud

### 6.1 建立 Firebase Project

1. 到 [Firebase Console](https://console.firebase.google.com/)。
2. 點「建立專案」。
3. 專案名稱可填：

   ```text
   adventure-diary-study
   ```

4. 記下 `Project ID`。它通常像：

   ```text
   adventure-diary-study-12345
   ```

5. Google Analytics 對本研究不是必要，可先關閉。
6. 建立完成後，到方案頁升級成 Blaze。
7. 綁定研究單位的 Google Cloud Billing Account。

後續範例會用：

```text
YOUR_PROJECT_ID
```

代表這個 Project ID。不要把專案顯示名稱誤當成 Project ID。

### 6.2 設定費用警示

1. 打開 [Google Cloud Console](https://console.cloud.google.com/)。
2. 上方選擇剛才的 Project。
3. 搜尋 `Budgets & alerts`。
4. 建立每月預算。
5. 建議先設定 50%、80%、100% 三段 Email 警示。

### 6.3 建立 Firebase Web App

1. 回到 Firebase Console 的專案首頁。
2. 點網頁圖示 `</>`。
3. App nickname 可填 `adventure-diary-web`。
4. 不要勾 Firebase Hosting，網站是部署在 Vercel。
5. 點「註冊應用程式」。
6. 畫面會出現：

   ```javascript
   const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     appId: "..."
   };
   ```

Firebase 官方說明可在專案首頁註冊 Web App 並取得這組設定。[Firebase Web 設定文件](https://firebase.google.com/docs/web/setup)

將值記入以下對照表：

| Firebase 顯示名稱 | Vercel 變數名稱 |
|---|---|
| `apiKey` | `NEXT_PUBLIC_FIREBASE_API_KEY` |
| `authDomain` | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
| `storageBucket` | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` |
| `appId` | `NEXT_PUBLIC_FIREBASE_APP_ID` |

這五個值是瀏覽器連線設定，不等於 Firebase Admin 私密金鑰；仍然不要隨意貼到公開討論區。

### 6.4 開啟 Authentication

1. Firebase 左側選 `Build` → `Authentication`。
2. 點「開始使用」。
3. 選 `Sign-in method`。
4. 開啟 `Email/Password`。
5. 不要開放自行註冊頁面；學生帳號由研究後台建立。

本系統會把 `ANNA-001` 之類的研究代碼轉成內部假 Email，學生不會看到或輸入真實 Email。

### 6.5 建立 Firestore

1. Firebase 左側選 `Build` → `Firestore Database`。
2. 點「建立資料庫」。
3. 選 Native mode／Standard edition。
4. Location 選：

   ```text
   asia-east1
   ```

5. 若畫面詢問規則模式，可以先完成建立，稍後會用專案裡的安全規則覆蓋。

Firestore location 建立後通常不能直接更換，選擇前先確認研究的資料位置需求。

### 6.6 建立 Storage

1. Firebase 左側選 `Build` → `Storage`。
2. 點「開始使用」。
3. 選 `asia-east1`。
4. 記下 bucket 名稱，新 bucket 常見格式為：

   ```text
   YOUR_PROJECT_ID.firebasestorage.app
   ```

5. Vercel 的 `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` 只填 bucket 名稱，不加 `gs://`。

### 6.7 部署 Firestore／Storage 安全規則

回到 PowerShell：

```powershell
cd C:\Users\User\Desktop\olafsaga
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore,storage
```

看到 Firestore rules、indexes、Storage rules 都成功才算完成。

這些規則會做到：

- 學生只能建立自己 UID 路徑下的 WAV。
- 只接受 `audio/wav`。
- 單檔不可超過 2 MB。
- 學生不能直接讀取研究資料。
- 音檔播放與刪除只能經過研究後台伺服器。

> `firebase deploy` 會用本專案內的規則覆蓋 Console 現有規則，不要在 Console 修改後忘記同步回程式碼。

### 6.8 加入 Firebase Authorized Domains

1. Firebase → Authentication → Settings。
2. 找到 `Authorized domains`。
3. 加入：

   ```text
   localhost
   你的-project.vercel.app
   ```

4. 若之後使用自訂網域，也要加入自訂網域。

沒有加入時，正式登入可能出現 `auth/unauthorized-domain`。

---

## 第七部分：建立 Google Cloud 服務帳號與權限

「服務帳號」不是人員帳號，而是讓 Vercel 或 Cloud Run 能安全存取 Firebase 的機器身分。

本手冊建立兩個：

| 服務帳號 | 用途 |
|---|---|
| `adventure-diary-runtime` | 給 Cloud Run emotion2vec 與 ZIP job 使用 |
| `adventure-diary-vercel` | 給 Vercel API 使用 |

### 7.1 設定目前 Project

```powershell
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud config get-value project
```

最後一行必須顯示正確 Project ID。

### 7.2 開啟需要的 Google APIs

```powershell
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com iam.googleapis.com firestore.googleapis.com storage.googleapis.com
```

### 7.3 建立兩個服務帳號

```powershell
gcloud iam service-accounts create adventure-diary-runtime --display-name="Adventure Diary Cloud Run"
gcloud iam service-accounts create adventure-diary-vercel --display-name="Adventure Diary Vercel"
```

完整 Email 會是：

```text
adventure-diary-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com
adventure-diary-vercel@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### 7.4 給 Cloud Run runtime 權限

```powershell
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:adventure-diary-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/datastore.user"
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:adventure-diary-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/storage.objectAdmin"
```

用途：

- `roles/datastore.user`：讀寫 Firestore。
- `roles/storage.objectAdmin`：讀取 WAV、建立 ZIP。

### 7.5 給 Vercel 服務帳號權限

```powershell
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:adventure-diary-vercel@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/firebaseauth.admin"
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:adventure-diary-vercel@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/datastore.user"
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:adventure-diary-vercel@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/storage.objectAdmin"
```

這些角色分別用於建立學生帳號、讀寫研究資料，以及管理研究 WAV。正式環境不需要把整個 Project Owner 權限交給 Vercel。

### 7.6 產生給 Vercel 的 JSON Key

```powershell
gcloud iam service-accounts keys create .\vercel-service-account.json --iam-account="adventure-diary-vercel@YOUR_PROJECT_ID.iam.gserviceaccount.com"
```

Google 官方提醒：service account JSON 是長期私密金鑰，必須安全保管並定期輪替。[Service account key 官方說明](https://cloud.google.com/iam/docs/keys-create-delete)

轉成程式需要的單行 Base64：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path ".\vercel-service-account.json")))
```

PowerShell 會輸出一大串文字。這整串就是：

```text
FIREBASE_SERVICE_ACCOUNT_BASE64
```

安全注意事項：

1. 不要把輸出貼到 GitHub。
2. 不要截圖。
3. 貼入 Vercel Secret 後，把原 JSON 移到單位的密碼管理器或加密保管區。
4. 確認部署成功後，可依單位政策刪除部署電腦上的明文 JSON。
5. 金鑰外洩時，立即在 Google Cloud IAM 停用／刪除並產生新 Key。

如果學校的 Google Organization 禁止建立長期 Key，請由資訊人員設定 Workload Identity Federation；不要為了方便解除整個組織的安全政策。

---

## 第八部分：部署 emotion2vec Cloud Run

這個服務負責 Agent 2 的真實語音情緒分析。Agent 1 不會呼叫它。

### 8.1 部署

PowerShell 先切換到專案：

```powershell
cd C:\Users\User\Desktop\olafsaga
```

執行以下單行命令：

```powershell
gcloud run deploy adventure-diary-emotion --source ".\cloud-run\emotion-service" --project YOUR_PROJECT_ID --region asia-east1 --service-account "adventure-diary-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com" --cpu 4 --memory 16Gi --concurrency 1 --timeout 60 --no-allow-unauthenticated --set-env-vars "MODEL_ID=iic/emotion2vec_plus_base,MODEL_HUB=hf"
```

如果詢問是否啟用 API、建立 Artifact Registry 或允許 Cloud Build，選 `Y`。

這個服務刻意不公開。Cloud Run 支援 `--no-allow-unauthenticated`，只有具 Invoker 權限且附 ID token 的請求能進入。[Cloud Run 部署文件](https://cloud.google.com/run/docs/deploying)

第一次建置或第一次啟動會下載模型，可能需要數分鐘。

### 8.2 取得服務 URL

```powershell
gcloud run services describe adventure-diary-emotion --region asia-east1 --format="value(status.url)"
```

記下結果，例如：

```text
https://adventure-diary-emotion-xxxxx-de.a.run.app
```

這是 Vercel 的：

```text
EMOTION_SERVICE_URL
```

### 8.3 允許 Vercel 呼叫

```powershell
gcloud run services add-iam-policy-binding adventure-diary-emotion --region asia-east1 --member="serviceAccount:adventure-diary-vercel@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/run.invoker"
```

Cloud Run 的私密服務使用 ID token 驗證，呼叫身分需要 `roles/run.invoker`。[Cloud Run 服務對服務驗證](https://cloud.google.com/run/docs/authenticating/service-to-service)

### 8.4 測試服務健康狀態

```powershell
$emotionUrl = gcloud run services describe adventure-diary-emotion --region asia-east1 --format="value(status.url)"
$identityToken = gcloud auth print-identity-token
Invoke-RestMethod "$emotionUrl/healthz" -Headers @{ Authorization = "Bearer $identityToken" }
```

正常會看到：

```text
status modelVersion
------ ------------
ok     iic/emotion2vec_plus_base
```

若出現 403，先確認目前登入的 Google 帳號有 Cloud Run Invoker 或 Project Owner 權限。

---

## 第九部分：部署 WAV ZIP 匯出工作

這個 Cloud Run Job 只在研究者要求匯出時執行，把大量 WAV 做成 ZIP。Job 不會一直運作。

Cloud Run Job 需要先建置成 container image，不能直接把資料夾當成一般網站部署。

### 9.1 建立 Artifact Registry

```powershell
gcloud artifacts repositories create adventure-diary --repository-format=docker --location=asia-east1 --description="Adventure Diary containers"
```

如果顯示 repository 已存在，可以繼續下一步。

### 9.2 建置 ZIP Job image

```powershell
cd C:\Users\User\Desktop\olafsaga
gcloud builds submit ".\cloud-run\export-job" --tag "asia-east1-docker.pkg.dev/YOUR_PROJECT_ID/adventure-diary/export-job:1.0.0"
```

等 Cloud Build 顯示 `SUCCESS`。

### 9.3 建立 Cloud Run Job

```powershell
gcloud run jobs deploy adventure-diary-export --image "asia-east1-docker.pkg.dev/YOUR_PROJECT_ID/adventure-diary/export-job:1.0.0" --project YOUR_PROJECT_ID --region asia-east1 --service-account "adventure-diary-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com" --cpu 2 --memory 4Gi --task-timeout 3600s --max-retries 1
```

Cloud Run Job 會執行任務後結束，不會像 HTTP service 一直等待請求。[Cloud Run Jobs 官方說明](https://cloud.google.com/run/docs/create-jobs)

### 9.4 允許 Vercel 啟動 Job

```powershell
gcloud run jobs add-iam-policy-binding adventure-diary-export --region asia-east1 --member="serviceAccount:adventure-diary-vercel@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/run.jobsExecutor"
```

`roles/run.jobsExecutor` 可以執行與取消 Cloud Run Job。[Cloud Run IAM 角色](https://cloud.google.com/iam/docs/roles-permissions/run)

Vercel 稍後要填：

```text
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
CLOUD_RUN_EXPORT_REGION=asia-east1
CLOUD_RUN_EXPORT_JOB_NAME=adventure-diary-export
```

---

## 第十部分：申請並建立 Azure Speech

Azure Speech 負責：

- 即時語音轉文字
- Accuracy
- Fluency
- Prosody
- Monotone 判定原始資料

### 10.1 建立 Azure Subscription 與 Resource Group

1. 登入 [Azure Portal](https://portal.azure.com/)。
2. 若沒有 Subscription，先建立或請學校 Azure 管理員提供。
3. 建立 Resource Group：

   ```text
   rg-adventure-diary-study
   ```

4. 建議同時到 `Cost Management + Billing` 建立預算與 Email 警示。

### 10.2 建立 Speech Resource

1. Azure Portal 搜尋 `Speech`。
2. 選擇建立 Speech／Foundry resource for Speech。
3. Subscription 選研究單位的訂閱。
4. Resource Group 選剛才建立的群組。
5. Region 建議選 East Asia；實際仍要確認該區域支援所需 Speech 功能與配額。
6. Name 可填：

   ```text
   adventure-diary-speech
   ```

7. Pricing tier 依試測規模選擇。
8. 建立後進入 Resource。
9. 找到 `Keys and Endpoint`。
10. 複製 `KEY 1` 及 `Location/Region`。

對應 Vercel：

```text
AZURE_SPEECH_KEY=KEY 1 的內容
AZURE_SPEECH_REGION=eastasia
```

Region 必須和 Key 所屬資源完全一致，否則會驗證失敗。[Azure Speech 區域說明](https://learn.microsoft.com/azure/ai-services/speech-service/regions)

`AZURE_SPEECH_KEY` 是機密；學生瀏覽器只會收到短效 token，不會收到這把原始 Key。

---

## 第十一部分：申請並建立 Azure OpenAI

Azure OpenAI 負責：

- 判斷學生使用英文或中文
- 是否離題
- 文法是否足以理解
- 是否包含該節點必要情節
- 是否有感受表達

### 11.1 確認 Azure OpenAI 權限與配額

1. 確認 Azure Subscription 可以建立 Microsoft Foundry／Azure OpenAI 資源。
2. 如果模型清單沒有 `gpt-5-mini`，可能是區域、訂閱權限或 quota 問題。
3. 到 Azure Portal／Foundry 的 quota 頁確認此模型有可分配容量。
4. 40 人同時使用前，另外確認 RPM／TPM 配額。

Azure OpenAI quota 依 Subscription、Region、Model／Deployment type 分開計算。[Azure OpenAI quota 說明](https://learn.microsoft.com/azure/ai-services/openai/quotas-limits)

### 11.2 建立資源

Azure 介面可能顯示 `Microsoft Foundry`、`Azure AI Foundry` 或 `Azure OpenAI`；名稱會隨 Microsoft 介面更新。

1. 到 [Microsoft Foundry](https://ai.azure.com/) 或 Azure Portal。
2. 建立 Foundry／Azure OpenAI 資源。
3. 使用：

   ```text
   Resource Group: rg-adventure-diary-study
   Resource name: adventure-diary-openai
   ```

4. Region 選擇可部署 `gpt-5-mini` 且配額足夠的區域。
5. 開啟模型目錄。
6. 找到 `gpt-5-mini`。
7. 點 `Deploy`。
8. Deployment name 建議就填：

   ```text
   gpt-5-mini
   ```

程式呼叫的是 Deployment name，不只是模型的顯示名稱。[Azure 模型部署說明](https://learn.microsoft.com/azure/foundry-classic/openai/how-to/create-resource)

### 11.3 取得 Endpoint 與 Key

請取得「Azure OpenAI 相容 endpoint」，通常類似：

```text
https://YOUR_RESOURCE_NAME.openai.azure.com
```

不要貼 Foundry Project 頁面中含有 `/api/projects/...` 的網址。

到 Resource 的 `Keys and Endpoint` 複製：

```text
AZURE_OPENAI_ENDPOINT=https://YOUR_RESOURCE_NAME.openai.azure.com
AZURE_OPENAI_API_KEY=KEY 1 的內容
AZURE_OPENAI_DEPLOYMENT=gpt-5-mini
AZURE_OPENAI_API_VERSION=2025-04-01-preview
```

本系統用 JSON Schema Structured Outputs 限制模型回傳固定欄位，不讓模型自行控制研究流程。Azure 官方要求 schema 欄位列為 required，本專案已依此實作。[Structured Outputs 官方說明](https://learn.microsoft.com/azure/foundry/openai/how-to/structured-outputs)

如果測試出現 404，最常見原因是：

- Endpoint 貼成 Foundry Project endpoint。
- Deployment name 和實際名稱不同。
- API version 不支援該資源。

---

## 第十二部分：把正式環境變數填入 Vercel

到：

```text
Vercel Project → Settings → Environment Variables
```

正式研究資料建議只勾 `Production`。不要讓每個 Git branch Preview 都連到正式學生資料庫。若需要正式 Preview，應建立另一套測試 Firebase／Azure 資源。

### 完整變數對照表

| Vercel 變數 | 從哪裡取得 | 是否機密 |
|---|---|---:|
| `NEXT_PUBLIC_DEMO_MODE` | 固定填 `false` | 否 |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web App `apiKey` | 否 |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Web App `authDomain` | 否 |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Project ID | 否 |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Web App `storageBucket` | 否 |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Web App `appId` | 否 |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | 第 7.6 節產生的 Base64 | **是** |
| `AZURE_SPEECH_KEY` | Azure Speech `KEY 1` | **是** |
| `AZURE_SPEECH_REGION` | Azure Speech Region，例如 `eastasia` | 否 |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI 相容 endpoint | 否 |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI `KEY 1` | **是** |
| `AZURE_OPENAI_DEPLOYMENT` | 模型 Deployment name | 否 |
| `AZURE_OPENAI_API_VERSION` | 固定版本 | 否 |
| `EMOTION_SERVICE_URL` | Cloud Run emotion service URL | 否 |
| `EMOTION_SERVICE_TOKEN` | 使用 Google IAM 時留空 | **是／可空白** |
| `GOOGLE_CLOUD_PROJECT` | Google Project ID | 否 |
| `CLOUD_RUN_EXPORT_REGION` | `asia-east1` | 否 |
| `CLOUD_RUN_EXPORT_JOB_NAME` | `adventure-diary-export` | 否 |

Vercel 不會因為你新增環境變數而自動改動已完成的舊 deployment；新增完後：

1. 到 `Deployments`。
2. 找最新 Production deployment。
3. 點三點選單。
4. 選 `Redeploy`。
5. 不要勾使用舊 Build Cache，避免舊的 `NEXT_PUBLIC_*` 留在前端 bundle。

Vercel 的環境變數會依 Production、Preview、Development 分開套用。[Vercel Environment Variables](https://vercel.com/docs/environment-variables)

---

## 第十三部分：建立第一個研究者帳號

正式模式不提供公開註冊，所以要先建立第一位研究者。

### 13.1 暫時把 Firebase Admin Key 載入 PowerShell

在安全的部署電腦執行：

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_BASE64 = "貼上第 7.6 節的整串 Base64"
$env:NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "YOUR_PROJECT_ID.firebasestorage.app"
```

### 13.2 建立研究者

```powershell
cd C:\Users\User\Desktop\olafsaga
npm.cmd run bootstrap:researcher -- RESEARCHER-01 "請換成至少12字元的強密碼"
```

成功會顯示：

```text
Researcher account RESEARCHER-01 is ready (...)
```

### 13.3 清除目前 PowerShell 裡的秘密

```powershell
Remove-Item Env:FIREBASE_SERVICE_ACCOUNT_BASE64
Remove-Item Env:NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
```

將研究者代碼與初始密碼分開交付；第一次交接後應更換密碼。

---

## 第十四部分：匯入學生與研究資料

### 14.1 先準備外部研究同意

系統不負責取得研究同意。正式匯入前要先確認：

- 受試者已完成外部同意程序。
- 有正式 `consentVersion`。
- 有同意日期。
- 有研究結束與資料保存／刪除說明。

### 14.2 準備學生 CSV

範例位於：

```text
samples/participants.csv
```

格式：

```csv
code,password,classId,consentVersion,consentedAt
ANNA-001,ChangeMe123!,class-a,consent-2026-v1,2026-07-28
ANNA-002,ChangeMe456!,class-a,consent-2026-v1,2026-07-28
```

注意：

- 不要放學生真實姓名或真實 Email。
- `code` 不可重複。
- 密碼至少要夠長且不能全部相同。
- `classId` 相同的學生會在同一班級進行 1:1 區塊隨機。
- 未提供同意版本者不能開始研究場次。

### 14.3 後台匯入

1. 用 `RESEARCHER-01` 登入正式 Vercel 網站。
2. 選「受試者」。
3. 點「選擇 CSV」。
4. 確認成功筆數。
5. 若出現錯誤，先不要重複按，先記下錯誤代碼。

### 14.4 匯入 1200 單字

1. 準備 CSV 或 TXT。
2. 每行一個單字，或用逗號分隔。
3. 登入研究後台 →「研究設定」。
4. 點「匯入並發布 1200 單字」。
5. 系統會建立不可變版本。
6. 新場次使用新版本；已開始的場次不會被改掉。

---

## 第十五部分：正式上線前逐項驗收

### 基本功能

- [ ] `NEXT_PUBLIC_DEMO_MODE=false`
- [ ] 學生登入需要密碼
- [ ] 未同意學生不能開始
- [ ] Agent 1 與 Agent 2 都可完成五節點
- [ ] 學生端不顯示實驗組
- [ ] 沒有任何角色圖片

### 麥克風與語音

- [ ] 使用真實 iPad Safari
- [ ] Vercel 網址是 HTTPS
- [ ] 第一次錄音會跳麥克風權限
- [ ] 直向與橫向都可操作
- [ ] 每段 30 秒會停止
- [ ] WAV 可在研究後台播放
- [ ] Azure 有 Accuracy、Fluency、Prosody 原始資料

### 流程判定

- [ ] 正確回答通過
- [ ] 少於 8 個英文詞會追問
- [ ] 中文、空白或「不知道」會給鷹架
- [ ] 離題會導回
- [ ] Accuracy 或 Fluency 不足會重試
- [ ] Agent 2 平淡或錯誤情緒會重試
- [ ] 第三次仍失敗會 `forced_advance`，不是 `passed`
- [ ] 技術錯誤不增加學生嘗試次數

### 離線與資料保存

- [ ] 錄音時關閉 Wi-Fi，畫面顯示離線保存
- [ ] 重新整理後錄音仍在待上傳佇列
- [ ] 恢復網路後自動續傳
- [ ] Firestore 只有一筆相同 `attemptId`
- [ ] 重新登入會回到原節點與輪次

### 後台與匯出

- [ ] 可以看場次、逐字稿與分數
- [ ] 音檔短效連結約五分鐘失效
- [ ] 研究註記不會覆寫原始資料
- [ ] CSV 可下載
- [ ] JSON 可下載
- [ ] WAV ZIP Job 會完成
- [ ] 刪除音檔會留下 audit log

### 壓力與成本

- [ ] 先用 5 台 iPad 小測
- [ ] 再測 40 台同時送出
- [ ] 暖機狀態判定 p95 ≤ 8 秒
- [ ] emotion2vec p95 ≤ 5 秒
- [ ] Google Cloud 預算警示可寄達
- [ ] Azure 預算警示可寄達

本機單元測試通過不等於完成 40 人雲端壓力測試。

---

## 第十六部分：常見錯誤怎麼處理

| 畫面或錯誤 | 最常見原因 | 處理方法 |
|---|---|---|
| Vercel 仍顯示 Demo | `NEXT_PUBLIC_DEMO_MODE` 還是 `true`，或尚未 Redeploy | 改成 `false` 後重新部署 |
| `auth/unauthorized-domain` | Vercel 網域不在 Firebase Authorized domains | 加入 `xxx.vercel.app`／自訂網域 |
| Firebase Storage 402／403 | 尚未升級 Blaze、規則未部署或路徑錯誤 | 檢查 Billing、Storage rules |
| Firestore 要求 index | `firestore.indexes.json` 尚未部署 | 再執行 `firebase deploy --only firestore` |
| Azure Speech 401／403 | Key 與 Region 不同資源 | 對照 Keys and Endpoint |
| 沒有 Accuracy／Fluency | Speech token 或 Pronunciation Assessment 未成功 | 看 Vercel Function logs 與 Azure 配額 |
| Azure OpenAI 404 | Endpoint、Deployment name 或 API version 錯誤 | 逐一對照第 11.3 節 |
| emotion2vec 401／403 | Vercel service account 沒有 Invoker | 重做第 8.3 節 |
| emotion2vec timeout | 第一次冷啟動、記憶體不足或模型下載中 | 重試並查看 Cloud Run Logs |
| WAV ZIP 一直 queued | Job Executor 權限或 Job 本身失敗 | 查看 Cloud Run Jobs → Executions／Logs |
| iPad 沒有麥克風 | 非 HTTPS、Safari 權限被拒絕、其他 App 佔用 | 檢查網址與 iPad 網站設定 |
| Vercel build 顯示 Node 不支援 | Node.js 版本過舊 | Vercel Project Settings 改 22 以上 |

查看紀錄的位置：

- Vercel：Project → Logs
- Firebase：Firestore／Storage Console
- Cloud Run：Service 或 Job → Logs
- Azure：Resource → Monitoring／Metrics

正式 logs 不應額外輸出逐字稿、API Key、模型 Prompt 或完整簽名音檔網址。

---

## 第十七部分：正式交接時，對方必須交給你什麼

以下是「研究單位／原帳號持有人」需要交接給系統維護者的內容。

### 17.1 帳號與權限

- [ ] GitHub Repository 網址
- [ ] 你被加入 GitHub Repository Admin／Maintainer
- [ ] Vercel Team 名稱
- [ ] 你被加入 Vercel Project
- [ ] Firebase／Google Cloud Project ID
- [ ] 你被加入 Google Cloud Project，至少能查看資源與 Billing
- [ ] Google Cloud Billing 負責人的聯絡方式
- [ ] Azure Subscription 名稱與 ID
- [ ] Azure Resource Group 名稱
- [ ] 你被加入 Azure Resource Group 的適當角色
- [ ] 預算警示收件人已包含研究負責人

### 17.2 系統資源清單

- [ ] 正式 Vercel 網址
- [ ] 自訂網域與 DNS 管理單位（若有）
- [ ] Firebase Web App 名稱
- [ ] Firestore database location
- [ ] Storage bucket 名稱
- [ ] Cloud Run emotion service 名稱、URL、Region
- [ ] Cloud Run export job 名稱、Region
- [ ] Artifact Registry repository 名稱
- [ ] Azure Speech resource 名稱與 Region
- [ ] Azure OpenAI resource 名稱
- [ ] Azure OpenAI deployment name／model version
- [ ] Azure Speech 與 OpenAI quota 狀態

### 17.3 秘密資料

這些資料必須透過密碼管理器或單位核准的 Secret Vault 交接：

- [ ] Vercel `FIREBASE_SERVICE_ACCOUNT_BASE64`
- [ ] Azure Speech Key
- [ ] Azure OpenAI Key
- [ ] 第一個研究者帳號與臨時密碼
- [ ] 金鑰建立日期與預定輪替日期

不要在交接文件內直接寫出 Key。交接文件只寫「保存位置」與「負責人」。

### 17.4 研究資料與規則

- [ ] 正式 1200 單字 CSV／TXT
- [ ] `consentVersion`
- [ ] 研究同意日期來源
- [ ] 受試者代碼產生規則
- [ ] 班級代碼表
- [ ] 研究開始／結束日期
- [ ] WAV 保存年限
- [ ] 研究結束後刪除流程
- [ ] Frozen／Olaf 文字角色設定的使用授權確認
- [ ] emotion2vec 程式與模型用途的權利確認

### 17.5 交接完成後

1. 由新管理者實際登入 GitHub、Vercel、Firebase、Google Cloud、Azure。
2. 新管理者完成一次 Vercel Redeploy。
3. 建立一個測試學生並跑完一個節點。
4. 下載一次 CSV／JSON／WAV ZIP。
5. 確認預算警示收件人。
6. 旋轉研究者臨時密碼。
7. 視單位政策旋轉 service account 與 Azure Keys。
8. 原開發者移除不再需要的 Owner 與 Secret 存取權。

---

## 第十八部分：部署完成紀錄表

部署時可以複製以下內容到單位內部文件；不要填入任何完整 API Key。

```text
系統名稱：
正式網址：
GitHub Repository：
Vercel Team／Project：

Google Cloud Project ID：
Google Cloud Billing 負責人：
Firebase Web App：
Firestore Location：
Storage Bucket：
emotion2vec Service／Region：
WAV Export Job／Region：

Azure Subscription：
Azure Resource Group：
Speech Resource／Region：
OpenAI Resource：
OpenAI Deployment：

正式 Config Version：
正式 Vocabulary Version：
Consent Version：
資料保存期限：

金鑰保存位置：
金鑰輪替負責人：
下次輪替日期：
技術維護聯絡人：
研究負責人：
```

---

## 最後提醒

正式上線至少需要四類人共同確認：

1. **研究負責人**：同意流程、內容、資料保存與研究設計。
2. **帳務負責人**：Google Cloud、Azure、Vercel 方案與預算警示。
3. **技術負責人**：部署、權限、金鑰、監控與故障處理。
4. **個資／倫理負責人**：受試者代碼、音檔、研究同意與刪除政策。

如果目前只想讓老師或研究團隊看畫面，完成到「第五部分 Vercel Demo」即可；若要收學生真實資料，必須完成後面所有正式部署與驗收步驟。
