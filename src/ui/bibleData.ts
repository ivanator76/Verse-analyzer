import type { BibleData, LangId } from '../core/bible';

// 內建經文（和合本、BSB、SBLGNT）是各 1.7–4MB 的 JSON：用到的時候才載入，不拖慢 app 啟動。
// 來源與授權見 src/data/bible/SOURCES.md。

const FILES: Record<LangId, string> = { 'zh-Hant': 'cuv', en: 'bsb', grc: 'sblgnt' };
const cache: Partial<Record<LangId, Promise<BibleData>>> = {};

export function loadVersion(lang: LangId): Promise<BibleData> {
  // 用變數組路徑：不讓 TypeScript 去推論整份 JSON 的型別（會很慢），Vite 仍然會把它們各自打包成獨立的檔案
  const p = (cache[lang] ??= import(`../data/bible/${FILES[lang]}.json`).then((m) => m.default as BibleData));
  p.catch(() => delete cache[lang]); // 載入失敗下次可以重試
  return p;
}
