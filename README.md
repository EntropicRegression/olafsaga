# Adventure Diary 語音學習研究原型

這是一套可部署到 Vercel 的 Next.js 研究原型。學生用 iPad 麥克風完成五個故事節點，每個節點包含情節與感受兩輪；系統會保存 WAV、最終逐字稿、Azure 原始評分、語意／情緒判定、回覆版本與完整狀態轉移。畫面不使用任何 Frozen／Olaf 圖像。

目前專案可直接以 Demo Mode 執行，不需要雲端帳號；切換正式模式後會使用 Firebase、Azure Speech、Azure OpenAI 與 Cloud Run。

## 已實作

- iPad 直向／橫向皆可使用的純文字語音聊天與五頁冒險日記。
- 單一 `MediaStream` 同時送到 Azure 即時 STT 與 `AudioWorklet`。
- 16 kHz、16-bit、mono WAV；每段最長 30 秒、Storage 單檔上限 2 MB。
- `en-US`／`zh-TW` 候選語言、Accuracy、Fluency、Prosody、Monotone。
- 完整判定順序、三次有效嘗試、技術錯誤不計次、第三次輔助前進。
- Agent 1／Agent 2 隔離；Agent 1 不呼叫 emotion2vec。
- IndexedDB 離線佇列，連同 WAV、逐字稿、評分與 `attemptId` 自動續傳。
- Firestore 恢復節點、輪次、嘗試次數與日記確認狀態。
- 研究後台：完成率、組別平衡、節點分數、失敗原因、逐輪檢視、私密 WAV、研究註記、帳號匯入與匯出。
- CSV／JSON 五分鐘短效連結，以及由 Cloud Run Job 建立的大型 WAV ZIP。
- Firebase Security Rules、可變區塊 4／6 的 1:1 分派、不可變詞表版本與 audit log。

## 本機預覽

```bash
npm install
npm run dev
```

開啟 `http://localhost:3000`。未設定 Firebase 時會自動使用 Demo Mode：

- `ANNA-021`：Agent 1
- `ANNA-022`：Agent 2
- `RESEARCHER-DEMO`：研究後台

學生頁的「原型測試答案」可快速驗證通過、過短、離題與平淡語氣。Demo 資料只保存在瀏覽器 LocalStorage／IndexedDB。

## 品質檢查

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

測試涵蓋十個節點／輪次的正確答案、判定優先序、兩組隔離、第三次輔助前進、技術錯誤、所有句庫字數，以及 WAV 格式。

## 正式部署

完整步驟見 [部署手冊](docs/DEPLOYMENT.md)。先複製 `.env.example` 的所有值到 Vercel，再依序部署：

1. Firebase Authentication、Firestore、Storage 與安全規則。
2. Cloud Run emotion2vec service 和 WAV export job。
3. Azure Speech 與 Azure OpenAI。
4. Vercel production deployment。
5. 建立第一個研究者，再從後台匯入受試者。

資料契約、流程與集合說明見 [系統架構](docs/ARCHITECTURE.md)。

## 研究上線前

- 以後台匯入正式國二 1200 單字 CSV/TXT，確認新場次顯示該詞表版本。
- 由外部程序取得研究同意後，才匯入 `consentVersion` 與日期。
- 在 iPad Safari 實機測試麥克風、背景切換、直／橫向與網路中斷恢復。
- 以 40 台裝置做真實 Azure／Cloud Run 負載測試；單元測試不等於 p95 驗收。
- 確認角色文字設定與 [emotion2vec](https://github.com/ddlBoJack/emotion2vec) 模型權利符合研究與公開部署用途。

本儲存庫不包含 Frozen／Olaf 圖像、雲端金鑰、真實學生資料或研究同意文件。
