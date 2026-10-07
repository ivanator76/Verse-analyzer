import { joinRefs } from './commands';
import { detectVerses } from './detect';
import { rowsInOrder, segsText } from './tree';
import type { Doc, Seg } from './types';
import { verseKeys } from './verseblocks';
import { versesByRow } from './verses';

// §8 貼上到對照欄：先算出貼上計畫給預覽對話框顯示，使用者確認後才寫入。
// 逐行欄（mode='row'）：目標是「行」；整節欄（mode='verse'）：目標是「經節」（鍵為「章:節」）。

export type PasteMode = 'cells' | 'verse';
export type ExistingPolicy = 'overwrite' | 'append' | 'skip';
export type LeftoverPolicy = 'merge-last' | 'cancel';

export interface PasteTarget {
  /** 逐行欄：行 id；整節欄：「章:節」 */
  key: string;
  /** 預覽時辨識是哪一行（分析欄的文字） */
  rowText: string;
  /** 要貼進這一格的文字 */
  text: string;
  /** 這一格原本的內容（空字串＝沒有內容） */
  existing: string;
  /** 依經節對齊時，這一格收到哪些經節 */
  verses?: string[];
}

export interface Leftover {
  /** 例如「3:18」或「超出最後一行的第 2 行」 */
  label: string;
  text: string;
}

export interface PastePlan {
  mode: PasteMode;
  colId: string;
  /** 目標是經節（整節欄）還是行（逐行欄） */
  byVerse: boolean;
  targets: PasteTarget[];
  /** 找不到對應行的經節（依經節對齊）或超出最後一行的文字（逐格貼上） */
  leftovers: Leftover[];
  error?: string;
}

const text1 = (t: string): Seg[] => (t === '' ? [] : [{ t: 'text', text: t, marks: [] }]);
const flat = (t: string) => t.replace(/\s*\n\s*/g, ' ').trim();
const colOf = (doc: Doc, colId: string) => doc.settings.refColumns.find((c) => c.id === colId);

function splitLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines;
}

/** 逐格貼上：多行文字從目前這一格開始，依序往下填。 */
function planCells(doc: Doc, colId: string, startRowId: string, text: string): PastePlan {
  const rows = rowsInOrder(doc);
  const start = Math.max(0, rows.findIndex((r) => r.id === startRowId));
  const lines = splitLines(text);
  const plan: PastePlan = { mode: 'cells', colId, byVerse: false, targets: [], leftovers: [] };
  lines.forEach((ln, i) => {
    const row = rows[start + i];
    if (!row) {
      if (ln.trim() !== '') plan.leftovers.push({ label: `超出最後一行的第 ${i + 1} 行`, text: ln.trim() });
      return;
    }
    if (ln.trim() === '') return; // 空白行：這一格不動
    plan.targets.push({ key: row.id, rowText: segsText(row.main).trim(), text: ln.trim(), existing: segsText(row.refs[colId] ?? []).trim() });
  });
  return plan;
}

/** 貼上的文字沒寫章時用哪一章：分析欄的經節標記全在同一章就用那一章，否則用「起始章」。 */
function detectChapter(doc: Doc): number {
  const chapters = new Set<number>();
  for (const r of rowsInOrder(doc)) for (const s of r.main) if (s.t === 'verse') chapters.add(s.c);
  return chapters.size === 1 ? [...chapters][0] : doc.meta.startChapter;
}

/** 依經節對齊：依經節號把文字切開，每一節放到分析欄中「包含這一節」的第一行（逐行欄），或直接放進這一節（整節欄）。 */
function planVerses(doc: Doc, colId: string, text: string): PastePlan {
  const col = colOf(doc, colId);
  const byVerse = col?.mode === 'verse';
  const plan: PastePlan = { mode: 'verse', colId, byVerse: !!byVerse, targets: [], leftovers: [] };
  const det = detectVerses(splitLines(text), detectChapter(doc));
  if (det.count === 0) return { ...plan, error: '貼上的文字裡找不到連續的經節號' + (byVerse ? '' : '，請改用「逐格貼上」') };

  const chunks: { key: string; text: string }[] = [];
  let pre = '';
  det.lines.forEach((segs, li) => {
    for (const s of segs) {
      if (s.t === 'verse') chunks.push({ key: `${s.c}:${s.v}`, text: '' });
      else if (chunks.length) chunks[chunks.length - 1].text += s.text;
      else pre += s.text;
    }
    if (li < det.lines.length - 1) {
      if (chunks.length) chunks[chunks.length - 1].text += '\n';
      else pre += '\n';
    }
  });
  if (flat(pre)) plan.leftovers.push({ label: '開頭沒有經節號的文字', text: flat(pre) });

  const rows = rowsInOrder(doc);
  const by = versesByRow(doc);
  const keys = new Set(verseKeys(doc));
  const rowOf = (key: string) => rows.find((r) => by.get(r.id)!.includes(key));
  for (const ch of chunks) {
    const t = flat(ch.text);
    const row = rowOf(ch.key);
    if (!row) {
      plan.leftovers.push({ label: `找不到第 ${ch.key} 節對應的行`, text: t });
      continue;
    }
    const key = byVerse ? ch.key : row.id;
    if (byVerse && !keys.has(ch.key)) continue;
    const prev = plan.targets.find((x) => x.key === key);
    if (prev) {
      prev.text = segsText(joinRefs(text1(prev.text), text1(t)));
      prev.verses!.push(ch.key);
    } else
      plan.targets.push({
        key,
        rowText: segsText(row.main).trim(),
        text: t,
        existing: segsText((byVerse ? col!.verses?.[ch.key] : row.refs[colId]) ?? []).trim(),
        verses: [ch.key],
      });
  }
  const pos = (k: string) => (byVerse ? [...keys].indexOf(k) : rows.findIndex((r) => r.id === k));
  plan.targets.sort((a, b) => pos(a.key) - pos(b.key));
  return plan;
}

export function planRefPaste(doc: Doc, colId: string, startRowId: string, text: string, mode: PasteMode): PastePlan {
  // 整節欄沒有「逐格」的概念，一律依經節
  if (colOf(doc, colId)?.mode === 'verse') return planVerses(doc, colId, text);
  return mode === 'cells' ? planCells(doc, colId, startRowId, text) : planVerses(doc, colId, text);
}

/** 預設用哪種模式：文字裡有連續經節號、而且分析欄有經節標記時，建議依經節對齊。 */
export function suggestMode(doc: Doc, text: string): PasteMode {
  if (colOf(doc, doc.settings.refColumns[0]?.id ?? '')?.mode === 'verse') return 'verse';
  const hasVerses = rowsInOrder(doc).some((r) => r.main.some((s) => s.t === 'verse'));
  return hasVerses && detectVerses(splitLines(text), detectChapter(doc)).count >= 2 ? 'verse' : 'cells';
}

export interface Choices {
  /** 每個有原內容的格子怎麼處理；沒列出的用 defaultExisting */
  existing?: Record<string, ExistingPolicy>;
  defaultExisting: ExistingPolicy;
  leftover: LeftoverPolicy;
}

/** 依使用者的選擇算出要寫入的格子。leftover 為「取消」且有剩餘文字時回傳 null（整個貼上取消）。 */
export function resolvePlan(doc: Doc, plan: PastePlan, ch: Choices): { key: string; segs: Seg[] }[] | null {
  if (plan.error) return null;
  if (plan.leftovers.length && ch.leftover === 'cancel') return null;
  const col = colOf(doc, plan.colId);
  const rows = rowsInOrder(doc);
  const cell = new Map<string, Seg[]>();
  const stored = (key: string): Seg[] =>
    plan.byVerse ? col?.verses?.[key] ?? [] : rows.find((r) => r.id === key)?.refs[plan.colId] ?? [];
  const current = (key: string) => cell.get(key) ?? stored(key);
  const touched = new Set<string>();
  for (const t of plan.targets) {
    const pol = t.existing === '' ? 'overwrite' : (ch.existing?.[t.key] ?? ch.defaultExisting);
    if (pol === 'skip') continue;
    cell.set(t.key, pol === 'append' ? joinRefs(current(t.key), text1(t.text)) : text1(t.text));
    touched.add(t.key);
  }
  if (plan.leftovers.length) {
    const vk = verseKeys(doc);
    const last = plan.byVerse ? vk[vk.length - 1] : rows[rows.length - 1].id;
    if (last === undefined) return null;
    for (const l of plan.leftovers) {
      cell.set(last, joinRefs(current(last), text1(l.text)));
      touched.add(last);
    }
  }
  return [...touched].map((key) => ({ key, segs: cell.get(key)! }));
}
