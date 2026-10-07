# 第三方內容與授權

這個專案的程式碼用 MIT 授權（見 `LICENSE`）。下面這些**不是**用 MIT 授權的，各有自己的條件。

## 內建經文

完整的來源網址、取得日期與授權聲明在 [`src/data/bible/SOURCES.md`](src/data/bible/SOURCES.md)。摘要：

| 版本 | 授權 | 使用上要注意 |
|---|---|---|
| 和合本（Chinese Union Version，1919，繁體） | 公有領域 | 在台灣、中國大陸和大多數地區沒有版權。**香港聖經公會曾主張它在香港與澳門的權利**，在港澳使用請自行確認。資料帶有「」『』等新式標點。修訂版（和合本修訂版等）仍有版權，**沒有**收錄 |
| Berean Standard Bible（BSB） | 公有領域（CC0），2023 年 4 月 30 日起 | 無條件 |
| SBL Greek New Testament（SBLGNT） | **CC BY 4.0** | **必須標示來源**：SBL Greek New Testament © 2010 Society of Biblical Literature and Logos Bible Software, CC BY 4.0。app 產生的文件會自動在最後一頁頁尾印出這個標示；再散布時請保留 |

**沒有收錄**有版權的版本：Nestle-Aland（NA26／NA27／NA28）、UBS 希臘文新約等。

## 字型

- **Gentium Plus**：Copyright © 2003–2022 SIL International。用 SIL Open Font License 1.1 授權（<https://openfontlicense.org>）。透過 npm 套件 `@fontsource/gentium-plus` 取得。

## 主要的開放原始碼套件

| 套件 | 授權 |
|---|---|
| React、React DOM | MIT |
| ProseMirror（state、view、model、commands） | MIT |
| Immer | MIT |
| Vite、Vitest | MIT |
| Electron（桌面版） | MIT |
| fast-check（測試） | MIT |

各套件的完整授權文字在它們各自的套件裡（`node_modules/<套件>/LICENSE`）。
