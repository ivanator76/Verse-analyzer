# 內建經文的來源與授權

這個資料夾裡的經文是用 `scripts/build_bible_data.py` 從下面兩個公開來源轉出來的精簡 JSON。
取得日期：2026-10-07（SBLGNT 同日）。

| 檔案 | 版本 | 授權 | 來源 |
|---|---|---|---|
| `cuv.json` | 和合本（Chinese Union Version，1919，繁體、上帝版用字） | 公有領域（見下面的說明） | https://github.com/midvash/bible-data （`versions/zh/cuv/cuv.json`；該資料庫的 `SOURCES.md` 列為 public-domain） |
| `sblgnt.json` | SBL Greek New Testament（SBLGNT，2010；v1.2 含約 7:53–8:11），只有新約 | **CC BY 4.0**（不是公有領域）：可以自由使用、修改、散布，但**必須標示來源**。Copyright 2010 Society of Biblical Literature and Logos Bible Software | https://github.com/LogosBible/SBLGNT （`data/sblgnt/text/<書卷>.txt`；授權見該 repo 的 README 和 LICENSE）、https://sblgnt.com |
| `bsb.json` | Berean Standard Bible（BSB） | 公有領域：翻譯團隊於 2023 年 4 月 30 日宣告捐贈為公有領域（CC0） | https://github.com/scrollmapper/bible_databases （2025 分支 `formats/json/BSB.json`）；官方說明 https://berean.bible/licensing.htm |

## 和合本的授權說明（請注意）

- 和合本 1919 年的原譯本，在台灣、中國大陸和大多數地區是公有領域。
- 香港聖經公會曾經主張它在**香港與澳門**的權利。如果你的使用範圍包含港澳，請自行確認。
- 這份資料帶有「」『』等新式標點，文字用字是「上帝」版（神版用字可以在帶入經文時選擇「改用『神』字」，那只是把「上帝」換成「神」）。
- 修訂版（和合本修訂版 RCUV 等）仍有版權，**沒有**包含在這裡。

## SBLGNT 的標示要求（CC BY 4.0）

用到 SBLGNT 的文件，標示是：

> SBL Greek New Testament © 2010 Society of Biblical Literature and Logos Bible Software, CC BY 4.0

app 會把它寫進文件（`meta.credits`），並印在最後一頁的下邊界裡（螢幕和 PDF 都有）。轉成 JSON 時只做了這些改動：去掉版本記號（⸀⸁⸂⸃⸄⸅）、把空白整理成一個；文字裡的 [ ]（文本本身的括號）和 ⟦ ⟧（約 7:53–8:11 的雙括號）都保留。

## BSB 的來源聲明

The Holy Bible, Berean Standard Bible, BSB is produced in cooperation with Bible Hub, Discovery Bible, OpenBible.com, and the Berean Bible Translation Committee. This text of God's Word has been dedicated to the public domain.

## 資料格式

`{ "id", "name", "books": { "<OSIS 書卷代碼>": [ [第 1 節, 第 2 節, …], … 每一章 … ] } }`。
節號 = 陣列索引 + 1；該版本沒有的節（例如和合本沒有收的經節）是空字串。
