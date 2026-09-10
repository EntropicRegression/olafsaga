# Experiment Batch 與受試者帳號流程修改規畫書

## 1. 文件目的

本規畫將目前散落在全域研究設定、受試者帳號、班級分組佇列與 Study Session 中的「一次實驗」提升為可明確建立、啟動、關閉與匯出的研究資料單位。

本階段只規畫系統修改，不變更或刪除既有 Firebase 資料。

## 2. 現況與問題

目前系統沒有第一級的 Experiment 實體；實驗範圍實際上等於 `studyMetadata/current` 加上 Firestore 內所有學生與場次。

| 項目 | 現況 | 影響 |
|---|---|---|
| 研究設定 | `studyMetadata/current` 是全域唯一設定 | 無法同時管理測試與正式實驗 |
| 設定版本 | 新 Session 會鎖定當時的 config／vocabulary | 單一 Session 可重現，但無法判斷屬於哪次實驗 |
| 受試者帳號 | `participants` 沒有 Experiment 關聯 | 測試帳號與正式帳號會混在一起 |
| 分組 | 首次建立 Session 時依 `classId` 分派 | 相同班級跨實驗會共用分組佇列 |
| 單筆建帳 | 研究者手動填代碼、密碼、班級、同意資料 | 大量建帳效率低且容易輸入不一致 |
| CSV 建帳 | 每列必須自行準備密碼 | 帳密產生與安全交付不順暢 |
| 重複匯入 | 既有帳號會被重設密碼，`group` 會寫回 `null` | 可能破壞既有分組與登入資訊 |
| Demo／測試資料 | Demo 依代碼奇偶分組；正式 Firebase 測試資料沒有標記 | 無法可靠排除測試資料 |
| 後台總覽 | 聚合所有 Session | 不能切換或比較指定實驗 |
| 研究匯出 | 匯出所有受試者資料 | 不能只匯出某次實驗 |

## 3. 建議領域語言

以下名稱先作為實作預設；開始實作時同步寫入根目錄 `CONTEXT.md`。

**Experiment Batch**：多位受試者共用同一研究設定、詞表、同意書版本、分組規則與資料收集期間的一次實驗批次。

**Participant Account**：提供學生登入的 Firebase Auth 身分；它本身不擁有永久實驗組別。

**Enrollment**：Participant Account 參與某個 Experiment Batch 的關係，擁有班級、組別、資格狀態與開始／完成時間。

**Study Session**：單一 Enrollment 執行冒險日記的一次連續流程；重開始會建立同一 Enrollment 下的新 Study Session。

## 4. 目標與不在範圍內的工作

### 4.1 目標

- 研究者可以明確建立、選取、啟動與關閉 Experiment Batch。
- 測試批次與正式批次在資料、總覽與匯出上可可靠區分。
- 設定、詞表、同意書版本與分組規則在啟動後鎖定。
- 後端可批次產生學生代碼與安全密碼，並提供一次性帳密 CSV。
- 重複代碼預設回報衝突，不再暗中重設密碼或清空組別。
- Session、Attempt、Restart、Worksheet 與匯出都能追溯 `experimentId`。
- 研究後台預設只顯示目前選取的 Experiment Batch。
- 匯出只包含選取批次，格式維持每位受試者一筆 JSONL，且不含音檔。

### 4.2 本次不處理

- 不製作獨立研究資料閱讀器。
- 不刪除 Firebase Storage 中既有 WAV。
- 不改變 Azure Speech、Azure OpenAI 或 emotion2vec 的判定方式。
- 不將學生真實姓名加入系統。
- 不自動偽造正式研究同意時間。

## 5. Experiment Batch 生命週期

```text
draft ──activate──> active ──close──> closed ──archive──> archived
```

### `draft`

- 可以修改顯示名稱、用途、設定版本、詞表版本與同意書版本。
- 可以產生或匯入 Enrollment 與帳密。
- 不允許學生建立 Study Session。

### `active`

- 設定、詞表、同意書與分組方法不可修改。
- 學生可以建立或恢復 Study Session。
- 第一版鎖定 roster，不允許新增 Enrollment；如需新增，建立新 Batch，避免樣本定義漂移。

### `closed`

- 不允許建立新的 Study Session 或 Attempt。
- 只有在沒有 active／awaiting confirmation Session 時才允許關閉。
- 可以檢視及匯出資料。

### `archived`

- 從預設後台清單隱藏，但資料仍保留且可匯出。
- 不刪除 Participant Account、Session 或研究紀錄。

## 6. 建議 Firestore 資料模型

### 6.1 Experiment Batch

路徑：`experiments/{experimentId}`

```ts
interface ExperimentBatch {
  id: string;
  code: string;                  // 例如 PILOT-2026-01
  name: string;
  mode: "test" | "formal";
  status: "draft" | "active" | "closed" | "archived";
  configVersion: string;
  vocabularyVersion: string;
  thresholds: StudyThresholds;  // 啟動時的完整快照
  consentVersion: string;
  allocationMethod: "permuted-block-4-6";
  participantCodePrefix: string;
  rosterSize: number;
  createdAt: string;
  createdBy: string;
  activatedAt?: string;
  activatedBy?: string;
  closedAt?: string;
  closedBy?: string;
}
```

重要不變條件：

- `code` 全域唯一，建立後不可修改。
- `active` 後不得修改研究設定與 roster。
- `mode=formal` 的資料不會和 `mode=test` 一起出現在預設總覽或匯出。
- 允許同時存在多個 active Batch；學生由自己的 active Enrollment 路由，不依賴全域 current Experiment。

### 6.2 Enrollment

路徑：`experiments/{experimentId}/enrollments/{participantId}`

```ts
interface Enrollment {
  participantId: string;
  participantCode: string;
  classId: string;
  group: "agent1" | "agent2";
  status: "issued" | "started" | "completed" | "disabled";
  allocationBlockId: string;
  allocationPosition: number;
  allocationMethod: "permuted-block-4-6";
  consentVersion: string;
  consentedAt: string;
  credentialsIssuedAt: string;
  startedAt?: string;
  completedAt?: string;
}
```

重要不變條件：

- 組別屬於 Enrollment，不再屬於 Participant Account。
- 同一 Participant Account 同時間最多只能有一個 active Experiment Enrollment。
- 組別一旦寫入不可修改。
- 正式 Enrollment 必須有同意書版本與實際取得同意時間。

### 6.3 分組狀態

路徑：`experiments/{experimentId}/classes/{classId}`

每個 Experiment Batch、每個班級擁有獨立的 4／6 可變區塊佇列。分組在建立 Enrollment 時由 Firestore transaction 寫入，而不是等學生首次登入才決定。

這樣可以在實驗開始前確認組別平衡，並保留 `allocationBlockId` 與位置供研究稽核。後台只顯示統計；學生端永遠不顯示組別。

### 6.4 Participant Account

既有 `participants/{uid}` 保留為登入身分：

```ts
interface ParticipantAccount {
  code: string;
  role: "student" | "researcher";
  activeExperimentId?: string;
  createdAt: string;
  updatedAt: string;
}
```

歷史 `classId`、`group` 與 consent 欄位在相容期保留，但新流程以 Enrollment 為準。

### 6.5 研究紀錄加欄位

以下文件新增不可變的 `experimentId` 與必要的 `enrollmentId`：

- `sessions/{sessionId}`
- `sessions/{sessionId}/attempts/{attemptId}`
- `studyRestarts/{restartId}`
- `worksheets/{sessionId}/entries/{nodeId}`
- `exports/{exportId}`

Session 仍保存 config、vocabulary、thresholds 快照，避免 Experiment 文件日後封存時影響可重現性。

## 7. 帳號與密碼流程

### 7.1 批次產生

研究者在 Draft Batch 輸入：

- 班級代碼
- 受試者數量（第一版上限 200）
- 代碼前綴，例如 `PILOT01`
- 起始流水號，例如 `001`
- 同意書版本
- 每位受試者的同意時間，或上傳包含同意時間的 roster CSV

後端負責：

1. 預先檢查所有代碼是否和 Firebase Auth／Firestore 衝突。
2. 使用 Node crypto 產生密碼，不接受前端自行產生的正式批次密碼。
3. 建立 Firebase Auth、Participant Account 與 Enrollment。
4. 以 Experiment＋Class 的獨立區塊佇列分組。
5. 回傳一次性的 credentials CSV。

Credentials CSV：

```csv
experimentCode,participantCode,password,classId
PILOT-2026-01,PILOT01-001,...,CLASS-A
```

密碼不得：

- 寫入 Firestore。
- 寫入 audit log、Vercel log 或研究資料匯出。
- 在帳密 CSV 下載完成後由後端再次讀取。

遺失密碼時使用獨立的「重設登入密碼」動作；不利用 roster 重複匯入暗中重設。

### 7.2 Roster CSV 匯入

新的正式 roster CSV 不需要 password 欄位：

```csv
participantCode,classId,consentVersion,consentedAt
PILOT01-001,CLASS-A,consent-2026-v1,2026-09-10T08:00:00+08:00
```

- 使用可靠 CSV parser，支援 quoted field；不再用 `split(",")`。
- 整份檔案先驗證，再執行任何寫入。
- 發現重複代碼時整批停止並顯示行號，不修改既有帳號。
- 建立失敗時回滾本次新建的 Firebase Auth 帳號。
- 使用 idempotency key，避免重送產生部分重複帳號。

### 7.3 測試帳號

- 測試帳號必須位於 `mode=test` Batch。
- 可快速產生固定數量，例如 Agent 1／2 各四名。
- 代碼自動包含 Batch 前綴，不再依代碼奇偶隱式決定正式組別。
- Test Batch 預設不出現在 Formal 總覽和 Formal 匯出。
- 測試資料需要重跑時建立新的 Test Batch 或封存舊 Batch，不覆寫舊研究紀錄。

## 8. 後台操作流程

### 8.1 Experiment selector

研究後台頂部新增目前 Batch selector，所有頁面都以選取的 `experimentId` 查詢：

- 總覽
- 學習場次
- 受試者
- 研究設定
- 匯出

Test Batch 使用醒目的 TEST 標籤，避免誤認為正式資料。

### 8.2 建立 Experiment wizard

```text
基本資料
  → 選擇研究設定與詞表
  → 設定同意書與分組規則
  → 產生／匯入 roster
  → 預覽受試者及組別平衡
  → 啟動並鎖定
```

啟動前顯示確認摘要：人數、班級、兩組數量、設定版本、詞表版本與同意資料缺漏。任何正式 Enrollment 缺少 consent 時不得啟動。

### 8.3 關閉 Experiment

- 顯示 active Session 數量。
- 有進行中 Session 時拒絕關閉。
- 關閉後停用該 Batch 的新 Session／Attempt。
- 帳號可保留，以支援歷史查詢；Enrollment gate 負責禁止繼續作答。

## 9. Module 與程式修改位置

### 9.1 Experiment domain Module

新增 `lib/study/experiment.ts`，提供小型 Interface：

```ts
createExperimentDraft(input): ExperimentBatch
activateExperiment(experiment, enrollments): ExperimentBatch
closeExperiment(experiment, activeSessionCount): ExperimentBatch
```

生命週期、不變條件與錯誤集中在此 Module，測試不需要 Firebase。

### 9.2 Enrollment／allocation Module

新增 `lib/study/enrollment.ts`：

```ts
planEnrollmentBatch(input, allocationState): EnrollmentPlan
```

負責代碼序列、區塊分派結果與衝突前檢查。正式密碼生成留在 server adapter，不放進純 domain Module。

### 9.3 Server implementation

新增：

- `lib/server/experiment-repository.ts`
- `lib/server/participant-provisioning.ts`
- `app/api/admin/experiments/route.ts`
- `app/api/admin/experiments/[experimentId]/route.ts`
- `app/api/admin/experiments/[experimentId]/activate/route.ts`
- `app/api/admin/experiments/[experimentId]/close/route.ts`
- `app/api/admin/experiments/[experimentId]/participants/generate/route.ts`
- `app/api/admin/experiments/[experimentId]/participants/import/route.ts`

修改：

- `lib/server/auth.ts`：Principal 解析 active Experiment 與 Enrollment。
- `lib/server/repository.ts`：建立 Session／Attempt 時驗證 Experiment 狀態並寫入 `experimentId`。
- `lib/server/study-config.ts`：設定版本由 Experiment 選取，不再直接代表一次實驗。
- `lib/server/admin.ts`：overview、session detail 與 export 接受 `experimentId`。
- `lib/study/research-export.ts`：輸出 manifest 與每位學生紀錄時加入 Experiment metadata。

不另外建立只有單一 Firebase 實作的抽象 repository interface；先維持直接、可測試的 server Module，避免淺層轉接。

### 9.4 Admin UI

新增：

- `components/experiment-selector.tsx`
- `components/experiment-wizard.tsx`
- `components/experiment-roster.tsx`
- `components/credential-download.tsx`

修改：

- `components/research-dashboard.tsx`
- `components/participant-creator.tsx`
- `components/research-settings.tsx`

原本單筆 Quick Create 可保留給臨時 Test Batch；Formal Batch 以 wizard／roster 為主要流程。

## 10. Endpoint Interface

| Endpoint | 用途 |
|---|---|
| `GET /api/admin/experiments` | 列出研究者可管理的 Batch |
| `POST /api/admin/experiments` | 建立 Draft Batch |
| `GET /api/admin/experiments/{id}` | 讀取 Batch、roster 與 readiness |
| `PATCH /api/admin/experiments/{id}` | 只修改 Draft Batch |
| `POST /api/admin/experiments/{id}/participants/generate` | 批次產生帳號並回傳一次性帳密 CSV |
| `POST /api/admin/experiments/{id}/participants/import` | 驗證 roster 後批次建帳 |
| `POST /api/admin/experiments/{id}/activate` | 鎖定 roster 與設定並啟動 |
| `POST /api/admin/experiments/{id}/close` | 無進行中 Session 時關閉 |
| `GET /api/admin/overview?experimentId=...` | 指定 Batch 總覽 |
| `POST /api/admin/export` | Body 必須包含 `experimentId` |

學生端 `/api/session` 不要求學生選 Batch，而是由登入帳號的 `activeExperimentId` 與 Enrollment 安全解析。

## 11. Firestore Rules、索引與稽核

### 11.1 Security

- 瀏覽器仍不得直接讀寫研究 Firestore 集合。
- 所有 Experiment 管理 endpoint 必須驗證 researcher role。
- Participant 只能進入自己的 active Enrollment。
- 密碼、credentials CSV 內容不得記錄到 server log。

### 11.2 建議索引

- `sessions`: `experimentId + updatedAt desc`
- `sessions`: `experimentId + status + updatedAt desc`
- collection group `attempts`: `experimentId + nodeId + round`
- `studyRestarts`: `experimentId + createdAt`
- collection group `enrollments`: `status + group`

實際索引以 Emulator／Preview 查詢結果產生，提交至 `firestore.indexes.json`。

### 11.3 Audit actions

- `experiment.created`
- `experiment.updated`
- `experiment.activated`
- `experiment.closed`
- `experiment.archived`
- `experiment.participants_generated`
- `experiment.participants_imported`
- `participant.password_rotated`
- `experiment.export_created`

Audit 僅記錄 ID、數量、結果與操作者，不記錄密碼或逐字稿。

## 12. 既有資料遷移

採 additive migration，不搬移、不覆寫、不刪除原始文件。

### Phase A：相容欄位

1. 建立保留 Batch `LEGACY-UNSCOPED`，mode 設為 `test`。
2. 對沒有 `experimentId` 的現有資料產生 dry-run 報表。
3. 依 participant／session 關係補上 `experimentId`。
4. 建立對應 Enrollment，保留原 group、classId 與 consent。
5. 無法自動判斷的資料留在 `LEGACY-UNSCOPED`，不猜測為正式資料。

### Phase B：雙讀期

- 新資料一律寫入 Experiment schema。
- 後台仍能讀取缺少 `experimentId` 的 legacy 文件。
- 比較 migration 前後 participant、session、attempt、restart 數量。

### Phase C：切換

- 後台所有查詢要求 Experiment selector。
- Session 建立要求 active Enrollment。
- 舊的全域 Quick Import endpoint 停止提供重設行為。

### 回復策略

- 新 schema 是新增欄位與集合，舊程式可以忽略。
- 上線初期使用 `EXPERIMENT_BATCHES_ENABLED` feature flag。
- 發生問題時回復 Vercel 版本並關閉 flag；不執行反向刪除。

## 13. 測試規畫

### 13.1 Unit tests

- Experiment lifecycle 合法／非法轉移。
- Active 後不可修改設定或 roster。
- 代碼產生、補零、碰撞與 200 筆上限。
- 4／6 區塊在每個 Experiment＋Class 獨立且平衡。
- Enrollment group 不可修改。
- Formal consent 缺漏時不得 activate。
- 技術錯誤與 Restart 保持在相同 Experiment。
- 匯出只聚合指定 Experiment。

### 13.2 Firebase Emulator integration tests

- Auth 建立成功但 Firestore 失敗時的補償清理。
- 相同 idempotency key 不會重複建帳。
- 重複代碼不重設密碼、不清空 group。
- 兩個相同 classId 的 Batch 使用不同 allocation queue。
- Draft／Closed Batch 不能建立 Session。
- Session、Attempt、Worksheet、Restart 都寫入相同 `experimentId`。

### 13.3 Browser E2E

- 研究者建立 Test Batch、產生八個帳號、下載 credentials CSV。
- 啟動前 readiness 檢查可阻擋 consent 缺漏。
- 學生登入後自動進入正確 Batch。
- 後台 selector 只顯示該 Batch 的數據。
- 匯出 JSONL 一位學生一行且包含逐字稿、不含音檔路徑。
- 有 active Session 時不能 close；完成後可以 close。

## 14. 實作順序

### Milestone 1：Domain 與儲存基礎

- 新增 Experiment／Enrollment types 與純 domain Module。
- 建立 Firestore server Module、索引與 audit。
- 完成 lifecycle／allocation unit tests。

### Milestone 2：後台 Experiment 管理

- Experiment selector 與建立 wizard。
- Draft 設定、readiness、activate／close。
- 所有 overview 查詢加入 `experimentId`。

### Milestone 3：帳密與 roster

- 後端密碼產生與一次性 credentials CSV。
- 正式 CSV parser、整批驗證、衝突與補償處理。
- 停止既有 import 的隱式密碼／group 重設。

### Milestone 4：學生流程與資料歸屬

- Auth 解析 active Enrollment。
- Session／Attempt／Restart／Worksheet 寫入 Experiment linkage。
- Draft／Closed gate 與既有 Session 相容。

### Milestone 5：匯出與遷移

- 匯出限定 Experiment，加入 Experiment metadata。
- Legacy dry-run／backfill script。
- 數量核對、Preview 驗證與 Production feature flag rollout。

## 15. 驗收標準

- 研究者能在後台看見目前選取的 Batch、mode 與 status。
- 一次可以安全產生 1–200 個帳號並下載一次性帳密 CSV。
- Firebase／Firestore／log／研究匯出皆找不到明文密碼。
- 重複代碼不會修改既有密碼、group 或研究資料。
- Test 與 Formal Batch 的 dashboard、分組、Session 與匯出完全隔離。
- 每個 Session、Attempt、Restart 與 Worksheet 都能追溯 Experiment。
- 同一 classId 在不同 Batch 中有獨立分組狀態。
- Active Batch 的設定、詞表與 roster 不可變。
- Closed Batch 無法產生新 Session／Attempt。
- 匯出只包含選取 Batch，每位學生一筆且包含逐字稿、不含音檔。
- Migration 前後所有 legacy Session／Attempt 數量一致，沒有資料刪除。

## 16. 建議採用的預設決策

若開始實作時沒有另外指定，建議採用以下預設：

1. 「一次實驗」正式命名為 **Experiment Batch**。
2. Participant Account 與 Enrollment 分離，允許帳號保留歷史參與紀錄。
3. 每個帳號同時間最多一個 active Enrollment。
4. 組別在 Enrollment 建立時分派並鎖定，不等第一次登入。
5. Experiment activate 後鎖定 roster 與研究設定。
6. Test Batch 與 Formal Batch 預設完全隔離。
7. 既有未分類資料先歸入 `LEGACY-UNSCOPED` Test Batch，不刪除。
8. 密碼只在產生當下回傳一次；遺失後使用明確的 rotate 流程。

這些決策涉及研究資料歸屬、分組時點與長期匯出契約；正式採用後應新增 ADR 記錄原因與取捨。
