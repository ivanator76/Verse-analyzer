# 經文結構分析

用「括號樹」分析經文的邏輯結構：把經文一行一行排好，用括號把有關係的行包起來，標上它們之間的關係（因果、目的、解釋…），最後匯出成 A4 的 PDF。可以用繁體中文操作，支援注音等輸入法。

**線上使用（網頁版）：** <https://ivanator76.github.io/Verse-analyzer/>

網頁版不需要安裝、不需要註冊；你的文件只存在你自己的電腦，不會上傳。第一次使用請看畫面上的「說明」。

## 主要功能

- 括號樹編輯：建立、解除、移動（含拖曳）括號；一個括號可以同時有好幾個關係；可編輯的關係表
- 分析欄＋最多兩個對照欄（逐行或整節），可以互相交換
- 內建經文，可以直接帶入或加進對照欄：和合本、Berean Standard Bible、SBLGNT（希臘文新約）
- 經節標記與自動辨識；經節歸屬在移動、拆行、合併後保持不變
- A4 直向／橫向，自動分頁，括號跨頁，一列太高時自動跨頁
- 匯出 PDF（向量、文字可搜尋）與列印；匯出前會檢查還沒做完的分析
- 復原／重做，自動存檔與當機復原，存檔前驗證
- 桌面版（Mac，Electron）與網頁版

## 自己在電腦上跑

需要 Node.js 22 以上。

```bash
npm install
npm run dev          # 開發伺服器（瀏覽器）
npm test             # 自動測試
npm run typecheck    # 型別檢查
npm run electron     # 用 Electron 開（桌面版，開發模式）
npm run package      # 打包成 Mac app：release/經文結構分析-darwin-*/經文結構分析.app
npm run build:public # 建置網頁版（不含範例文件）→ dist/
```

## 部署到 GitHub Pages

專案已經附好 `.github/workflows/pages.yml`。推到 `main` 之後，GitHub Actions 會自動：型別檢查 → 測試 → 建置公開版 → 檢查 → 部署。

第一次使用要在 GitHub 專案的 **Settings → Pages** 把 **Source** 設成 **GitHub Actions**（這個專案已經設好了）。

## 文件

- 使用說明：app 裡的「說明」按鈕（來源是 [`help.html`](help.html)）
- 設計與規格：[`PLAN.md`](PLAN.md)

## 授權

- **程式碼**：MIT（見 [`LICENSE`](LICENSE)）。
- **內建經文與字型**各有自己的授權，**不是** MIT：見 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) 和 [`src/data/bible/SOURCES.md`](src/data/bible/SOURCES.md)。重點：
  - 和合本（1919）：公有領域；香港聖經公會曾主張它在香港與澳門的權利，在港澳使用請自行確認。
  - BSB：公有領域（CC0）。
  - SBLGNT：CC BY 4.0，**必須標示來源**（app 產生的文件會自動在頁尾標示）。
  - 沒有收錄 NA28、UBS 等有版權的希臘文新約。
  - 字型 Gentium Plus：SIL Open Font License 1.1。
