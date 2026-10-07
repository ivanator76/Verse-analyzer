import { createDoc, emptyRow } from './doc';
import { verseKeys } from './verseblocks';
import type { Doc, RelationType, Seg, Settings } from './types';
import { validateSettings } from './validate';

// 帶入經文（和合本 + 英文譯本）：選定範圍後，自動產生一份新文件。純函式；資料由呼叫端載入。

export interface BookInfo {
  osis: string;
  zh: string;
  en: string;
}

export const BOOKS: BookInfo[] = [
  ['Gen', '創世記', 'Genesis'], ['Exod', '出埃及記', 'Exodus'], ['Lev', '利未記', 'Leviticus'], ['Num', '民數記', 'Numbers'], ['Deut', '申命記', 'Deuteronomy'],
  ['Josh', '約書亞記', 'Joshua'], ['Judg', '士師記', 'Judges'], ['Ruth', '路得記', 'Ruth'], ['1Sam', '撒母耳記上', '1 Samuel'], ['2Sam', '撒母耳記下', '2 Samuel'],
  ['1Kgs', '列王紀上', '1 Kings'], ['2Kgs', '列王紀下', '2 Kings'], ['1Chr', '歷代志上', '1 Chronicles'], ['2Chr', '歷代志下', '2 Chronicles'], ['Ezra', '以斯拉記', 'Ezra'],
  ['Neh', '尼希米記', 'Nehemiah'], ['Esth', '以斯帖記', 'Esther'], ['Job', '約伯記', 'Job'], ['Ps', '詩篇', 'Psalms'], ['Prov', '箴言', 'Proverbs'],
  ['Eccl', '傳道書', 'Ecclesiastes'], ['Song', '雅歌', 'Song of Solomon'], ['Isa', '以賽亞書', 'Isaiah'], ['Jer', '耶利米書', 'Jeremiah'], ['Lam', '耶利米哀歌', 'Lamentations'],
  ['Ezek', '以西結書', 'Ezekiel'], ['Dan', '但以理書', 'Daniel'], ['Hos', '何西阿書', 'Hosea'], ['Joel', '約珥書', 'Joel'], ['Amos', '阿摩司書', 'Amos'],
  ['Obad', '俄巴底亞書', 'Obadiah'], ['Jonah', '約拿書', 'Jonah'], ['Mic', '彌迦書', 'Micah'], ['Nah', '那鴻書', 'Nahum'], ['Hab', '哈巴谷書', 'Habakkuk'],
  ['Zeph', '西番雅書', 'Zephaniah'], ['Hag', '哈該書', 'Haggai'], ['Zech', '撒迦利亞書', 'Zechariah'], ['Mal', '瑪拉基書', 'Malachi'],
  ['Matt', '馬太福音', 'Matthew'], ['Mark', '馬可福音', 'Mark'], ['Luke', '路加福音', 'Luke'], ['John', '約翰福音', 'John'], ['Acts', '使徒行傳', 'Acts'],
  ['Rom', '羅馬書', 'Romans'], ['1Cor', '哥林多前書', '1 Corinthians'], ['2Cor', '哥林多後書', '2 Corinthians'], ['Gal', '加拉太書', 'Galatians'], ['Eph', '以弗所書', 'Ephesians'],
  ['Phil', '腓立比書', 'Philippians'], ['Col', '歌羅西書', 'Colossians'], ['1Thess', '帖撒羅尼迦前書', '1 Thessalonians'], ['2Thess', '帖撒羅尼迦後書', '2 Thessalonians'],
  ['1Tim', '提摩太前書', '1 Timothy'], ['2Tim', '提摩太後書', '2 Timothy'], ['Titus', '提多書', 'Titus'], ['Phlm', '腓利門書', 'Philemon'], ['Heb', '希伯來書', 'Hebrews'],
  ['Jas', '雅各書', 'James'], ['1Pet', '彼得前書', '1 Peter'], ['2Pet', '彼得後書', '2 Peter'], ['1John', '約翰一書', '1 John'], ['2John', '約翰二書', '2 John'],
  ['3John', '約翰三書', '3 John'], ['Jude', '猶大書', 'Jude'], ['Rev', '啟示錄', 'Revelation'],
].map(([osis, zh, en]) => ({ osis, zh, en }));

/** 內建經文資料：書卷 → 章 → 節（節號 = 索引 + 1；沒有的節是空字串） */
export interface BibleData {
  id: string;
  name: string;
  books: Record<string, string[][]>;
}

export interface Ref {
  c: number;
  v: number;
}

export interface BibleRange {
  book: string;
  from: Ref;
  to: Ref;
}

export const MAX_VERSES = 400;

export const chapterCount = (b: BibleData, book: string) => b.books[book]?.length ?? 0;
export const verseCount = (b: BibleData, book: string, c: number) => b.books[book]?.[c - 1]?.length ?? 0;

const DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
/** 1 → 一、12 → 十二、21 → 二十一、100 → 一百、119 → 一百一十九 */
export function chineseNumber(n: number): string {
  if (n < 10) return DIGITS[n];
  if (n < 20) return '十' + (n % 10 ? DIGITS[n % 10] : '');
  if (n < 100) return DIGITS[Math.floor(n / 10)] + '十' + (n % 10 ? DIGITS[n % 10] : '');
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (rest === 0) return DIGITS[h] + '百';
  if (rest < 10) return DIGITS[h] + '百〇' + DIGITS[rest];
  return DIGITS[h] + '百' + (rest < 20 ? '一十' + (rest % 10 ? DIGITS[rest % 10] : '') : chineseNumber(rest));
}

const bookInfo = (osis: string) => BOOKS.find((b) => b.osis === osis);

const before = (a: Ref, b: Ref) => a.c < b.c || (a.c === b.c && a.v < b.v);

/** 檢查範圍；合法時回傳 null，否則回傳要顯示的說明。以和合本的章節結構為準。 */
export function validateRange(cuv: BibleData, r: BibleRange): string | null {
  if (!bookInfo(r.book)) return '請選擇書卷';
  if (!cuv.books[r.book]) return '這個版本沒有這卷書';
  const chs = chapterCount(cuv, r.book);
  for (const [name, ref] of [['起', r.from], ['迄', r.to]] as const) {
    if (!Number.isInteger(ref.c) || ref.c < 1 || ref.c > chs) return `${name}的章要介於 1 到 ${chs}`;
    const vs = verseCount(cuv, r.book, ref.c);
    if (!Number.isInteger(ref.v) || ref.v < 1 || ref.v > vs) return `${name}的節要介於 1 到 ${vs}（第 ${ref.c} 章）`;
  }
  if (before(r.to, r.from)) return '迄點不能在起點之前';
  const n = rangeRefs(cuv, r).length;
  if (n > MAX_VERSES) return `一次最多帶入 ${MAX_VERSES} 節（目前選了 ${n} 節），請縮小範圍`;
  return null;
}

/** 範圍內的所有經節（依和合本的章節結構展開）。 */
export function rangeRefs(cuv: BibleData, r: BibleRange): Ref[] {
  const out: Ref[] = [];
  for (let c = r.from.c; c <= r.to.c; c++) {
    const total = verseCount(cuv, r.book, c);
    const a = c === r.from.c ? r.from.v : 1;
    const z = c === r.to.c ? r.to.v : total;
    for (let v = a; v <= z; v++) out.push({ c, v });
  }
  return out;
}

/** 其他版本和分析欄的版本在這個範圍裡章節結構不同的地方（編號可能對不上）。 */
export function versificationWarnings(structure: BibleData, structureName: string, others: { short: string; data: BibleData }[], r: BibleRange): string[] {
  const out: string[] = [];
  for (const o of others)
    for (let c = r.from.c; c <= r.to.c; c++) {
      const a = verseCount(structure, r.book, c);
      const b = verseCount(o.data, r.book, c);
      if (a !== b) out.push(`第 ${c} 章：${structureName}有 ${a} 節，${o.short} 有 ${b} 節，${o.short} 可能和${structureName}錯位`);
    }
  return out;
}

export function formatRange(r: BibleRange): string {
  const zh = bookInfo(r.book)?.zh ?? r.book;
  if (r.from.c === r.to.c) {
    const head = `${zh}${chineseNumber(r.from.c)}`;
    return r.from.v === r.to.v ? `${head} ${r.from.v}` : `${head} ${r.from.v} 至 ${r.to.v}`;
  }
  return `${zh} ${r.from.c}:${r.from.v} 至 ${r.to.c}:${r.to.v}`;
}

export type LangId = 'zh-Hant' | 'en' | 'grc';

/** 內建的三個版本（來源與授權見 src/data/bible/SOURCES.md）。 */
export const VERSIONS: Record<LangId, { short: string; name: string; credit: string }> = {
  'zh-Hant': { short: '和合本', name: '中文（和合本）', credit: '和合本（Chinese Union Version，公有領域）' },
  en: { short: 'BSB', name: '英文（BSB）', credit: 'Berean Standard Bible（公有領域）' },
  grc: { short: 'SBLGNT', name: '希臘文（SBLGNT）', credit: 'SBL Greek New Testament © 2010 Society of Biblical Literature and Logos Bible Software, CC BY 4.0' },
};

export const LANG_IDS: LangId[] = ['zh-Hant', 'en', 'grc'];

/** 這卷書有哪些版本可以用：希臘文只有新約。 */
export function availableLangs(book: string): LangId[] {
  const isNT = BOOKS.findIndex((b) => b.osis === book) >= 39;
  return LANG_IDS.filter((l) => l !== 'grc' || isNT);
}

export interface ImportOptions {
  range: BibleRange;
  /** 已載入的版本資料 */
  versions: Partial<Record<LangId, BibleData>>;
  /** 放在分析欄的語言（一個） */
  main: LangId;
  /** 放在對照欄的語言（0 到 2 個，不能和分析欄重複） */
  refs: LangId[];
  /** 把和合本的「上帝」換成「神」（神版用字） */
  useShen?: boolean;
  relationTypes: RelationType[];
  /** 新文件的預設版面（偏好設定）；有對照欄時頁面方向改成橫向 */
  settings: Settings;
}

export type ImportResult = { doc: Doc; warnings: string[] } | { error: string };

/** 檢查語言配置；合法時回傳 null。 */
export function validateLayout(book: string, main: LangId, refs: LangId[]): string | null {
  const ok = availableLangs(book);
  if (!ok.includes(main)) return `${VERSIONS[main].short} 沒有這卷書（希臘文 SBLGNT 只有新約）`;
  if (refs.length > 2) return '對照欄最多 2 個';
  if (new Set(refs).size !== refs.length || refs.includes(main)) return '分析欄的語言不能同時放在對照欄';
  for (const r of refs) if (!ok.includes(r)) return `${VERSIONS[r].short} 沒有這卷書（希臘文 SBLGNT 只有新約）`;
  return null;
}

/**
 * 產生新文件：分析欄是你選的語言（每一節一行、行首有經節標記），其他選的語言各放一個「整節」對照欄，
 * 之後你把分析欄拆成好幾行，對照欄的譯文會自動跨越這一節涵蓋的所有行（§8）。
 */
export function buildDocFromBible(o: ImportOptions): ImportResult {
  const bad0 = validateLayout(o.range.book, o.main, o.refs);
  if (bad0) return { error: bad0 };
  const structure = o.versions[o.main];
  if (!structure) return { error: `${VERSIONS[o.main].short} 的資料還沒載入` };
  const err = validateRange(structure, o.range);
  if (err) return { error: err };
  for (const l of o.refs) if (!o.versions[l]) return { error: `${VERSIONS[l].short} 的資料還沒載入` };

  const refs = rangeRefs(structure, o.range);
  const settings = structuredClone(o.settings);
  settings.main.lang = o.main;
  if (o.refs.length) settings.page.orientation = 'landscape'; // 兩欄以上，橫向比較放得下
  const w = o.refs.length === 1 ? 0.3 : 0.22;
  settings.refColumns = o.refs.map((lang, i) => ({ id: `c${i + 1}`, lang, visible: true, width: w, mode: 'verse' as const, verses: {} }));
  const bad = validateSettings(settings);
  if (bad.length) return { error: bad[0] };

  const used = [o.main, ...o.refs];
  const doc = createDoc(`${formatRange(o.range)}（${used.map((l) => VERSIONS[l].short).join('、')}）`, o.relationTypes, settings);
  doc.meta = { title: doc.meta.title, book: o.range.book, startChapter: o.range.from.c, credits: `經文來源：${used.map((l) => VERSIONS[l].credit).join('；')}` };
  const text = (t: string): Seg[] => (t === '' ? [] : [{ t: 'text', text: t, marks: [] }]);
  const verseText = (l: LangId, ref: Ref) => {
    let t = (o.versions[l]?.books[o.range.book]?.[ref.c - 1]?.[ref.v - 1] ?? '').trim();
    if (l === 'zh-Hant' && o.useShen) t = t.replace(/上帝/g, '神');
    return t;
  };
  const warnings = [...used.slice(1).flatMap((l) => versificationWarnings(structure, VERSIONS[o.main].short, [{ short: VERSIONS[l].short, data: o.versions[l]! }], o.range))];
  doc.items = refs.map((ref, i) => {
    const main = verseText(o.main, ref);
    if (main === '') warnings.push(`${VERSIONS[o.main].short} 沒有第 ${ref.c}:${ref.v} 節`);
    const row = emptyRow(`r${i + 1}`, [{ t: 'verse', c: ref.c, v: ref.v, shown: true }, ...text(main)]);
    o.refs.forEach((l, k) => {
      const t = verseText(l, ref);
      if (t !== '') doc.settings.refColumns[k].verses![`${ref.c}:${ref.v}`] = text(t);
      else warnings.push(`${VERSIONS[l].short} 沒有第 ${ref.c}:${ref.v} 節`);
    });
    return { labels: {}, item: row };
  });
  doc.counter = refs.length;
  return { doc, warnings };
}

// ───────────────────────── 把內建經文加進既有文件的對照欄 ─────────────────────────

export interface ColumnPlan {
  /** 文件裡出現的經節（「章:節」），依閱讀順序 */
  keys: string[];
  /** 每一節要放進去的文字（找不到的節不在裡面） */
  texts: Record<string, string>;
  /** 文件裡有、但這個版本找不到的經節 */
  missing: string[];
}

/**
 * 依文件裡已經有的經節標記，從內建的某個版本取出每一節的文字。
 * 只動對照欄；分析欄的文字（例如你自己貼的 NA28）完全不碰。
 */
export function planBibleColumn(doc: Doc, data: BibleData, lang: LangId, book: string, useShen = false): ColumnPlan | { error: string } {
  if (!BOOKS.some((b) => b.osis === book)) return { error: '請先選擇書卷（這份文件沒有記錄是哪一卷）' };
  if (!availableLangs(book).includes(lang)) return { error: `${VERSIONS[lang].short} 沒有這卷書（希臘文 SBLGNT 只有新約）` };
  const keys = verseKeys(doc);
  if (keys.length === 0) return { error: '這份文件還沒有經節標記，沒辦法對齊。請先用「標為經節」標好節號，或貼上帶有節號的經文（會自動辨識）。' };
  const texts: Record<string, string> = {};
  const missing: string[] = [];
  for (const k of keys) {
    const [c, v] = k.split(':').map(Number);
    let t = (data.books[book]?.[c - 1]?.[v - 1] ?? '').trim();
    if (lang === 'zh-Hant' && useShen) t = t.replace(/上帝/g, '神');
    if (t === '') missing.push(k);
    else texts[k] = t;
  }
  if (Object.keys(texts).length === 0) return { error: `${VERSIONS[lang].short} 在這一卷裡找不到文件中的任何一節，請確認書卷是否選對` };
  return { keys, texts, missing };
}
