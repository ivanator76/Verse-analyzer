// 語言 → 字型（§8.1 前置工作）：分析欄和每個對照欄各依自己的語言選字型，
// 交換欄位之後文字才會用對的字型顯示。

export const LANG_NAMES: Record<string, string> = { grc: '希臘文', en: '英文', 'zh-Hant': '繁體中文' };

export const langName = (lang: string) => LANG_NAMES[lang] ?? lang;

/** 字型清單（CSS font-family）。希臘文、英文用文件設定的字型（預設 Gentium Plus）；中文用繁體宋體，缺字退回 Gentium Plus。 */
export function fontStackForLang(lang: string, mainFont = 'Gentium Plus'): string {
  if (lang === 'zh-Hant') return `"Songti TC", "宋體-繁", "PMingLiU", "${mainFont}", serif`;
  return `"${mainFont}", "Times New Roman", "Songti TC", serif`;
}
