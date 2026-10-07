import { current, produce, type Draft } from 'immer';
import { emptyRow } from './doc';
import { findType, labelText } from './relations';
import { firstRow, locate, normalizeSegs, rowsInOrder, segsText, type Loc } from './tree';
import type { Bracket, Child, Doc, Item, Label, Row, Seg } from './types';
import { validateSettings } from './validate';
import { pruneAnchors, restoreAnchors, startVerses } from './verses';

// 指令層（PLAN §3、§4）：每個指令是 (文件, 參數) → 新文件 + 提示訊息。
// 一次指令＝一個復原步驟。選取範圍由呼叫端處理。

export type Result = { doc: Doc; notices: string[] } | { error: string };

type D = Draft<Doc>;

function run(doc: Doc, fn: (d: D, notices: string[]) => string | void, opts: { anchors?: boolean } = {}): Result {
  const notices: string[] = [];
  let error: string | undefined;
  const before = opts.anchors ? startVerses(doc) : null;
  const next = produce(doc, (d) => {
    const e = fn(d, notices);
    if (e) {
      error = e;
      return;
    }
    cleanup(d as Doc);
    if (before) {
      restoreAnchors(d as Doc, before);
      pruneAnchors(d as Doc);
    }
  });
  return error ? { error } : { doc: next, notices };
}

const newId = (d: D, prefix: string) => `${prefix}${++d.counter}`;
const pendingLabel = (): Label => ({ text: null, main: false, pending: true });

function labelsFor(parent: Bracket | null, make: () => Label): Record<string, Label> {
  const out: Record<string, Label> = {};
  if (parent) for (const r of parent.relations) out[r.id] = make();
  return out;
}

function countRelations(doc: Doc): number {
  let n = 0;
  const walk = (list: Child[]) => {
    for (const c of list) if (c.item.kind === 'bracket') (n += c.item.relations.length), walk(c.item.children);
  };
  walk(doc.items);
  return n;
}

/** §4.2 括號自動整理，由內往外。就地修改。 */
export function cleanup(d: Doc): void {
  const clean = (list: Child[]) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      if (c.item.kind !== 'bracket') continue;
      clean(c.item.children);
      const kids = c.item.children;
      if (kids.length === 0) list.splice(i, 1);
      else if (kids.length === 1) list[i] = { labels: c.labels, item: kids[0].item };
    }
  };
  clean(d.items);
}

/** 兩個字元交界處是否要提示「補上空白」（§4.3）。 */
export function boundaryNeedsSpace(a: string, b: string): boolean {
  const x = a.slice(-1);
  const y = b.slice(0, 1);
  const letter = /[\p{Script=Latin}\p{Script=Greek}]/u;
  return letter.test(x) && letter.test(y);
}

const isCjk = (ch: string) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(ch);

export function joinRefs(a: Seg[] | undefined, b: Seg[] | undefined): Seg[] {
  const x = a ?? [];
  const y = b ?? [];
  const ta = segsText(x);
  const tb = segsText(y);
  if (ta === '' || tb === '') return normalizeSegs([...x, ...y]);
  const sep: Seg[] = isCjk(ta.slice(-1)) || isCjk(tb.slice(0, 1)) ? [] : [{ t: 'text', text: ' ', marks: [] }];
  return normalizeSegs([...x, ...sep, ...y]);
}

// ───────────────────────── 文字與行 ─────────────────────────

/** 游標位置：第 seg 個片段的第 off 個字元之前。seg 指向經節標記時，標記歸入後半段。 */
export interface Pos {
  seg: number;
  off: number;
}

function splitSegs(segs: Seg[], pos: Pos): [Seg[], Seg[]] {
  const head = segs.slice(0, pos.seg);
  const cur = segs[pos.seg];
  const tail = segs.slice(pos.seg + 1);
  if (!cur) return [normalizeSegs(head), []];
  if (cur.t === 'verse') return [normalizeSegs(head), normalizeSegs([cur, ...tail])];
  return [
    normalizeSegs([...head, { ...cur, text: cur.text.slice(0, pos.off) }]),
    normalizeSegs([{ ...cur, text: cur.text.slice(pos.off) }, ...tail]),
  ];
}

export function editCellText(doc: Doc, rowId: string, col: string | 'main', segs: Seg[]): Result {
  return run(doc, (d) => {
    const loc = locate(d as Doc, rowId);
    if (!loc || loc.list[loc.index].item.kind !== 'row') return '找不到這一行';
    const row = loc.list[loc.index].item as Row;
    if (col === 'main') row.main = normalizeSegs(segs);
    else row.refs[col] = normalizeSegs(segs);
  });
}

/** 在 R 之後放入新行（§4.3 的情況一／二）。回傳 void。 */
function placeAfterSplit(d: D, loc: Loc, rows: Row[]) {
  const here = loc.list[loc.index];
  const first = rows[0];
  if (!loc.parent || loc.parent.relations.length === 0) {
    loc.list.splice(loc.index + 1, 0, ...rows.slice(1).map((r) => ({ labels: {}, item: r })));
  } else {
    const s: Bracket = {
      kind: 'bracket',
      id: newId(d, 'b'),
      relations: [],
      children: rows.map((r) => ({ labels: {}, item: r })),
    };
    loc.list[loc.index] = { labels: here.labels, item: s };
  }
  void first;
}

export function splitRow(doc: Doc, rowId: string, pos: Pos): Result {
  return run(doc, (d) => {
    const loc = locate(d as Doc, rowId);
    if (!loc || loc.list[loc.index].item.kind !== 'row') return '找不到這一行';
    const r1 = loc.list[loc.index].item as Row;
    const [head, tail] = splitSegs(r1.main, pos);
    const r2 = emptyRow(newId(d, 'r'), tail);
    r2.indent = r1.indent;
    for (const k of Object.keys(r1.refs)) r2.refs[k] = [];
    r1.main = head;
    placeAfterSplit(d, loc, [r1, r2]);
  });
}

/** 貼上多行（§4.3）。lines 是依換行切開的文字。 */
export function pasteLines(doc: Doc, rowId: string, pos: Pos, lines: (string | Seg[])[]): Result {
  return run(doc, (d) => {
    const loc = locate(d as Doc, rowId);
    if (!loc || loc.list[loc.index].item.kind !== 'row') return '找不到這一行';
    const r1 = loc.list[loc.index].item as Row;
    const [head, tail] = splitSegs(r1.main, pos);
    const text = (s: string | Seg[]): Seg[] => (typeof s !== 'string' ? s : s === '' ? [] : [{ t: 'text', text: s, marks: [] }]);
    if (lines.length <= 1) {
      r1.main = normalizeSegs([...head, ...text(lines[0] ?? ''), ...tail]);
      return;
    }
    r1.main = normalizeSegs([...head, ...text(lines[0])]);
    const rows: Row[] = [r1];
    for (let i = 1; i < lines.length; i++) {
      const r = emptyRow(newId(d, 'r'), text(lines[i]));
      r.indent = r1.indent;
      for (const k of Object.keys(r1.refs)) r.refs[k] = [];
      rows.push(r);
    }
    const last = rows[rows.length - 1];
    last.main = normalizeSegs([...last.main, ...tail]);
    placeAfterSplit(d, loc, rows);
  });
}

/** Backspace 在行首：把 rowId 併入閱讀順序上的前一行（§4.3）。 */
export function mergeWithPrev(doc: Doc, rowId: string): Result {
  const rows = rowsInOrder(doc);
  const i = rows.findIndex((r) => r.id === rowId);
  if (i <= 0) return { error: '第一行沒有上一行可以合併' };
  const prevId = rows[i - 1].id;
  const before = countRelations(doc);
  const res = run(
    doc,
    (d) => {
      const dd = d as Doc;
      const r1 = locate(dd, prevId)!.list[locate(dd, prevId)!.index].item as Row;
      const loc2 = locate(dd, rowId)!;
      const r2 = loc2.list[loc2.index].item as Row;
      r1.main = normalizeSegs([...r1.main, ...r2.main]);
      for (const k of new Set([...Object.keys(r1.refs), ...Object.keys(r2.refs)]))
        r1.refs[k] = joinRefs(r1.refs[k], r2.refs[k]);
      loc2.list.splice(loc2.index, 1);
    },
    { anchors: true },
  );
  if ('error' in res) return res;
  const lost = before - countRelations(res.doc);
  if (lost > 0) res.notices.push(`合併時移除了 ${lost} 個括號關係，可按 ⌘Z 復原`);
  return res;
}

/** Delete 在行尾：等同下一行行首的 Backspace。 */
export function mergeWithNext(doc: Doc, rowId: string): Result {
  const rows = rowsInOrder(doc);
  const i = rows.findIndex((r) => r.id === rowId);
  if (i < 0 || i === rows.length - 1) return { error: '最後一行沒有下一行可以合併' };
  return mergeWithPrev(doc, rows[i + 1].id);
}

export type RefPolicy = 'delete' | 'merge-prev';

/** 刪除行（§4.3）。對照欄有內容時由呼叫端先詢問，決定 refPolicy。 */
export function deleteRows(doc: Doc, ids: string[], refPolicy: RefPolicy = 'delete'): Result {
  const all = rowsInOrder(doc);
  const set = new Set(ids);
  if (all.every((r) => set.has(r.id))) return { error: '至少要保留一行' };
  return run(
    doc,
    (d) => {
      const dd = d as Doc;
      if (refPolicy === 'merge-prev') {
        const order = rowsInOrder(dd);
        for (const r of order) {
          if (!set.has(r.id)) continue;
          const keep = order.slice(0, order.indexOf(r)).reverse().find((x) => !set.has(x.id)) ??
            order.slice(order.indexOf(r)).find((x) => !set.has(x.id));
          if (!keep) continue;
          const appendAtEnd = order.indexOf(keep) < order.indexOf(r);
          for (const k of Object.keys(r.refs)) {
            keep.refs[k] = appendAtEnd ? joinRefs(keep.refs[k], r.refs[k]) : joinRefs(r.refs[k], keep.refs[k]);
          }
        }
      }
      const strip = (list: Child[]) => {
        for (let i = list.length - 1; i >= 0; i--) {
          const it = list[i].item;
          if (it.kind === 'row') {
            if (set.has(it.id)) list.splice(i, 1);
          } else strip(it.children);
        }
      };
      strip(dd.items);
    },
    { anchors: true },
  );
}

export function indentRows(doc: Doc, ids: string[], delta: 1 | -1): Result {
  return run(doc, (d) => {
    for (const r of rowsInOrder(d as Doc)) if (ids.includes(r.id)) r.indent = Math.max(0, Math.min(12, r.indent + delta));
  });
}

export function setMeta(doc: Doc, patch: Partial<Pick<Doc['meta'], 'title' | 'startChapter'>>): Result {
  return run(doc, (d) => {
    if (patch.startChapter !== undefined && (!Number.isInteger(patch.startChapter) || patch.startChapter < 1)) return '章必須是正整數';
    Object.assign(d.meta, patch);
  });
}

/** 版面設定（一個復原步驟）。對照欄被移除時，各行裡對應的對照欄內容一起移除。 */
export function setSettings(doc: Doc, next: Doc['settings']): Result {
  const errs = validateSettings(next);
  if (errs.length) return { error: errs[0] };
  return run(doc, (d) => {
    d.settings = structuredClone(next);
    const keep = new Set(next.refColumns.map((c) => c.id));
    for (const r of rowsInOrder(d as Doc)) for (const k of Object.keys(r.refs)) if (!keep.has(k)) delete r.refs[k];
  });
}

/** 一次設定多個對照欄儲存格（貼上預覽確認後用；一個復原步驟）。 */
export function setRefCells(doc: Doc, colId: string, cells: { rowId: string; segs: Seg[] }[]): Result {
  if (!doc.settings.refColumns.some((c) => c.id === colId)) return { error: '找不到這個對照欄' };
  return run(doc, (d) => {
    const rows = new Map(rowsInOrder(d as Doc).map((r) => [r.id, r]));
    for (const c of cells) {
      const r = rows.get(c.rowId);
      if (!r) return '找不到這一行';
      r.refs[colId] = normalizeSegs(c.segs);
    }
  });
}

/**
 * 把全域關係表裡這份文件還沒有的關係加進來（id 沒出現過的才加）。
 * 絕不修改或刪除文件裡已有的關係，所以舊的分析顯示不會變。
 */
export function mergeRelationTypes(doc: Doc, global: Doc['relationTypes']): Result {
  const have = new Set(doc.relationTypes.map((t) => t.id));
  const names = new Set(doc.relationTypes.map((t) => t.name));
  const add = global.filter((t) => !have.has(t.id) && !names.has(t.name));
  if (add.length === 0) return { error: '這份文件已經有全域關係表裡所有的關係' };
  return run(doc, (d, notices) => {
    d.relationTypes.push(...structuredClone(add));
    notices.push(`已加入 ${add.length} 個關係：${add.map((t) => t.name).join('、')}`);
  });
}

/** 整節對照欄：設定某一節的譯文（依經節存放，不受分析欄拆行、合併影響）。 */
export function setVerseText(doc: Doc, colId: string, key: string, segs: Seg[]): Result {
  return setVerseCells(doc, colId, [{ key, segs }]);
}

export function setVerseCells(doc: Doc, colId: string, cells: { key: string; segs: Seg[] }[]): Result {
  const col = doc.settings.refColumns.find((c) => c.id === colId);
  if (!col || col.mode !== 'verse') return { error: '這不是整節對照欄' };
  return run(doc, (d) => {
    const c = d.settings.refColumns.find((x) => x.id === colId)!;
    c.verses ??= {};
    for (const cell of cells) {
      if (!/^\d+:\d+$/.test(cell.key)) return '經節格式不正確';
      const segs = normalizeSegs(cell.segs);
      if (segs.length === 0) delete c.verses[cell.key];
      else c.verses[cell.key] = segs;
    }
  });
}

/** 內建經文各版本的來源說明（和 core/bible.ts 的 VERSIONS 一致；這裡不 import 它是為了避免循環依賴）。 */
const BIBLE_CREDITS: Record<string, string> = {
  'zh-Hant': '和合本（Chinese Union Version，公有領域）',
  en: 'Berean Standard Bible（公有領域）',
  grc: 'SBL Greek New Testament © 2010 Society of Biblical Literature and Logos Bible Software, CC BY 4.0',
};

export type ExistingVersePolicy = 'overwrite' | 'skip' | 'append';

export interface BibleColumnSpec {
  /** 要加進哪個既有的對照欄；null＝新增一個對照欄 */
  colId: string | null;
  lang: string;
  book: string;
  /** 「章:節」→ 文字（planBibleColumn 的結果） */
  texts: Record<string, string>;
  /** 這個欄位裡某一節已經有內容時怎麼辦 */
  policy: ExistingVersePolicy;
}

/** 新對照欄的預設寬度；其他欄已經占掉太多時縮小到放得下為止（最少 5%）。 */
export function newColumnWidth(doc: Doc): number {
  const used = doc.settings.refColumns.filter((c) => c.visible).reduce((a, c) => a + c.width, 0);
  return Math.min(0.25, Math.round((0.7 - used) * 100) / 100);
}

/**
 * 把內建經文加進既有文件的對照欄（整節模式，依經節存放）。一個復原步驟。
 * 分析欄完全不動。對照欄原本是逐行模式時會改成整節模式（逐行的內容仍然保留，可以切回來）。
 */
export function addBibleColumn(doc: Doc, spec: BibleColumnSpec): Result {
  return run(doc, (d, notices) => {
    const dd = d as Doc;
    let col: Draft<Doc>['settings']['refColumns'][number] | undefined;
    if (spec.colId === null) {
      if (dd.settings.refColumns.length >= 2) return '對照欄最多 2 個，請選一個既有的對照欄，或先移除一個';
      const w = newColumnWidth(doc);
      if (w < 0.05) return '頁面寬度不夠放新的對照欄，請先縮小或關閉其他對照欄';
      const id = ['c1', 'c2', 'c3'].find((x) => !dd.settings.refColumns.some((c) => c.id === x))!;
      col = { id, lang: spec.lang, visible: true, width: w, mode: 'verse', verses: {} };
      dd.settings.refColumns.push(col);
      col = dd.settings.refColumns[dd.settings.refColumns.length - 1];
    } else {
      col = dd.settings.refColumns.find((c) => c.id === spec.colId);
      if (!col) return '找不到這個對照欄';
      if (col.mode !== 'verse') notices.push('這個對照欄改成了「整節」模式（原本逐行的內容仍然保留）');
      col.mode = 'verse';
      col.lang = spec.lang;
      col.visible = true;
    }
    const verses = (col.verses ??= {});
    let filled = 0;
    let skipped = 0;
    for (const [key, text] of Object.entries(spec.texts)) {
      const have = segsText(verses[key] ?? []).trim();
      if (have !== '' && spec.policy === 'skip') {
        skipped++;
        continue;
      }
      const incoming: Seg[] = [{ t: 'text', text, marks: [] }];
      verses[key] = have !== '' && spec.policy === 'append' ? joinRefs(verses[key], incoming) : incoming;
      filled++;
    }
    dd.meta.book ??= spec.book;
    // CC BY 要求標示來源：用到的版本記進文件的來源說明（不重複）
    const credit = BIBLE_CREDITS[spec.lang];
    if (credit && !(dd.meta.credits ?? '').includes(credit)) dd.meta.credits = dd.meta.credits ? `${dd.meta.credits}；${credit}` : `經文來源：${credit}`;
    const bad = validateSettings(dd.settings);
    if (bad.length) return bad[0];
    notices.push(`已加入 ${filled} 節${skipped ? `，略過 ${skipped} 節（已有內容）` : ''}`);
  });
}

// ───────────────────────── 交換分析欄與對照欄（§8.1） ─────────────────────────

export interface SwapPlan {
  error?: string;
  /** 含行中經節標記的行（標記會集中到行首，歸屬可能改變） */
  midMarkerRows: string[];
  /** 交換後新分析欄文字是空白的行數 */
  emptyNewMain: number;
  rows: number;
  mainLang: string;
  colLang: string;
}

function swapRow(r: Row, colId: string) {
  const markers = r.main.filter((s): s is Extract<Seg, { t: 'verse' }> => s.t === 'verse');
  const mainText = r.main.filter((s) => s.t === 'text');
  const refText = (r.refs[colId] ?? []).filter((s) => s.t === 'text');
  let seenText = false;
  let mid = false;
  for (const s of r.main) {
    if (s.t === 'text' && s.text !== '') seenText = true;
    else if (s.t === 'verse' && seenText) mid = true;
  }
  return { newMain: normalizeSegs([...markers, ...refText]), newRef: normalizeSegs(mainText), mid };
}

/** 交換前的檢查與統計（確認對話框用）。 */
export function planSwap(doc: Doc, colId: string): SwapPlan {
  const col = doc.settings.refColumns.find((c) => c.id === colId);
  const base: SwapPlan = { midMarkerRows: [], emptyNewMain: 0, rows: 0, mainLang: doc.settings.main.lang, colLang: col?.lang ?? '' };
  if (!col) return { ...base, error: '找不到這個對照欄' };
  if (col.mode !== 'row') return { ...base, error: '只能和「逐行」對照欄交換。整節對照欄是依經節存放的，請先把它改成逐行。' };
  const rows = rowsInOrder(doc);
  for (const r of rows) {
    const x = swapRow(r, colId);
    if (x.mid) base.midMarkerRows.push(r.id);
    if (segsText(x.newMain).trim() === '') base.emptyNewMain++;
  }
  base.rows = rows.length;
  if (base.emptyNewMain === rows.length) return { ...base, error: '這個對照欄還沒有任何內容，交換會讓分析欄全部變成空白' };
  return base;
}

/**
 * 交換分析欄與逐行對照欄：每一行的文字（含文字標記）和欄語言對調；括號、關係、縮排、分頁點不變。
 * 經節標記只能放在分析欄：每一行的經節標記依原順序集中到新分析欄文字的行首。
 */
export function swapMainWithRefColumn(doc: Doc, colId: string): Result {
  const plan = planSwap(doc, colId);
  if (plan.error) return { error: plan.error };
  return run(doc, (d, notices) => {
    const dd = d as Doc;
    for (const r of rowsInOrder(dd)) {
      const x = swapRow(r as Row, colId);
      r.main = x.newMain;
      r.refs[colId] = x.newRef;
    }
    const col = dd.settings.refColumns.find((c) => c.id === colId)!;
    [dd.settings.main.lang, col.lang] = [col.lang, dd.settings.main.lang];
    if (plan.midMarkerRows.length) notices.push(`${plan.midMarkerRows.length} 行含行中的經節標記，已移到行首，請檢查經節歸屬`);
    if (plan.emptyNewMain) notices.push(`${plan.emptyNewMain} 行的新分析欄文字是空白`);
  });
}

export function togglePageBreak(doc: Doc, rowId: string): Result {
  return run(doc, (d) => {
    const r = rowsInOrder(d as Doc).find((x) => x.id === rowId);
    if (!r) return '找不到這一行';
    r.pageBreakBefore = !r.pageBreakBefore;
  });
}

// ───────────────────────── 括號 ─────────────────────────

function describeDropped(d: Doc, parent: Bracket | null, children: Child[]): string[] {
  if (!parent) return [];
  const names: string[] = [];
  for (const c of children)
    for (const r of parent.relations) {
      const lab = c.labels[r.id];
      const type = findType(d.relationTypes, r.type);
      if (lab && !lab.pending && type) names.push(labelText(type, lab, d.settings) || type.name);
    }
  return names;
}

function droppedNotice(names: string[]): string | null {
  return names.length ? `已移除 ${names.length} 個標記（${names.join('、')}），可按 ⌘Z 復原` : null;
}

/** ⌘G：把相鄰、同一個父括號下的項目包成新括號。 */
export function createBracket(doc: Doc, ids: string[]): Result {
  return run(doc, (d, notices) => {
    const dd = d as Doc;
    if (ids.length < 2) return '請選取 2 個以上的項目';
    const locs = ids.map((id) => locate(dd, id));
    if (locs.some((l) => !l)) return '找不到選取的項目';
    const first = locs[0]!;
    if (locs.some((l) => l!.list !== first.list)) return '選取的項目必須在同一個括號下';
    const idx = locs.map((l) => l!.index).sort((a, b) => a - b);
    if (idx.some((v, i) => i > 0 && v !== idx[i - 1] + 1)) return '選取的項目必須相鄰';
    if (first.parent && idx.length === first.list.length) return '不能包住父括號的全部子項';
    const moved = first.list.slice(idx[0], idx[0] + idx.length);
    const dropped = describeDropped(dd, first.parent, moved);
    const b: Bracket = {
      kind: 'bracket',
      id: newId(d, 'b'),
      relations: [],
      children: moved.map((c) => ({ labels: {}, item: c.item })),
    };
    first.list.splice(idx[0], idx.length, { labels: labelsFor(first.parent, pendingLabel), item: b });
    const n = droppedNotice(dropped);
    if (n) notices.push(n);
  });
}

export type DissolveChoice = { mode: 'give'; childId: string } | { mode: 'allPending' } | { mode: 'direct' };

/** ⌘⇧G：解除括號。括號在父括號有標記時，必須由呼叫端給出 choice。 */
export function dissolveBracket(doc: Doc, bracketId: string, choice: DissolveChoice = { mode: 'direct' }): Result {
  return run(doc, (d) => {
    const loc = locate(d as Doc, bracketId);
    if (!loc || loc.list[loc.index].item.kind !== 'bracket') return '找不到這個括號';
    const slot = loc.list[loc.index];
    const b = slot.item as Bracket;
    const parentRels = loc.parent?.relations ?? [];
    const hasLabel = parentRels.some((r) => slot.labels[r.id] && !slot.labels[r.id].pending);
    let kids: Child[];
    if (parentRels.length === 0) {
      kids = b.children.map((c) => ({ labels: {}, item: c.item }));
    } else if (hasLabel && choice.mode === 'direct') {
      return '這個括號在父括號裡有標記，請選擇標記的去向';
    } else {
      if (choice.mode === 'give' && !b.children.some((c) => c.item.id === choice.childId))
        return '指定的子項不在這個括號裡';
      kids = b.children.map((c) => ({
        labels:
          choice.mode === 'give' && c.item.id === choice.childId
            ? structuredClone(current(slot).labels)
            : labelsFor(loc.parent, pendingLabel),
        item: c.item,
      }));
    }
    loc.list.splice(loc.index, 1, ...kids);
  }, { anchors: false });
}

/** ⌥↑／⌥↓：和相鄰兄弟交換位置。 */
export function moveItem(doc: Doc, id: string, dir: -1 | 1): Result {
  return run(
    doc,
    (d) => {
      const loc = locate(d as Doc, id);
      if (!loc) return '找不到項目';
      const j = loc.index + dir;
      if (j < 0 || j >= loc.list.length) return '已經在邊界，不能再移動';
      [loc.list[loc.index], loc.list[j]] = [loc.list[j], loc.list[loc.index]];
    },
    { anchors: true },
  );
}

export interface DropTarget {
  /** 要放在哪個項目（行或括號）旁邊 */
  anchorId: string;
  side: 'before' | 'after';
}

function containsId(item: Item, id: string): boolean {
  if (item.id === id) return true;
  return item.kind === 'bracket' && item.children.some((c) => containsId(c.item, id));
}

/**
 * 拖曳移動（可一次移動多個項目）：把項目放到 anchor 的前面或後面，成為 anchor 的兄弟。
 * - 放在同一個括號裡（重新排序）：標記跟著項目走。
 * - 搬到別的括號（或最上層）：原本的標記捨棄（有標記會提示），在新的父括號裡每個關係都是「待判定」。
 * - 閱讀順序改變時，經節歸屬保持不變（補隱藏錨點）。
 * 括號被搬空或只剩一個子項時，自動整理（§4.2）。
 */
export function moveItemsTo(doc: Doc, ids: string[], target: DropTarget): Result {
  return run(
    doc,
    (d, notices) => {
      const dd = d as Doc;
      const order = rowsInOrder(dd).map((r) => r.id);
      const firstIdx = (it: Item) => order.indexOf(firstRow(it).id);
      const found = [...new Set(ids)].map((id) => locate(dd, id)); // 同一個項目只算一次
      if (found.length === 0 || found.some((l) => !l)) return '找不到要移動的項目';
      let items = found.map((l) => l!.list[l!.index].item);
      // 只保留最上層的項目（括號和它裡面的行同時選取時，只移動括號）
      items = items.filter((it) => !items.some((o) => o !== it && containsId(o, it.id)));
      items.sort((a, b) => firstIdx(a) - firstIdx(b));
      if (items.some((it) => containsId(it, target.anchorId))) return '不能移到自己裡面';
      const before = JSON.stringify(current(dd.items));

      // 先把所有項目從原位置拿出來，記下它們原本屬於哪個 list 和標記
      const taken: { child: Child; from: Child[]; fromParent: Bracket | null }[] = [];
      for (const it of items) {
        const l = locate(dd, it.id)!;
        taken.push({ child: l.list[l.index], from: l.list, fromParent: l.parent });
      }
      for (const t of taken) t.from.splice(t.from.indexOf(t.child), 1);

      const al = locate(dd, target.anchorId);
      if (!al) return '找不到目標位置';
      let at = al.index + (target.side === 'after' ? 1 : 0);
      const dropped: string[] = [];
      for (const t of taken) {
        if (t.from === al.list) {
          // 同一個括號裡重新排序：標記跟著走
          al.list.splice(at++, 0, t.child);
        } else {
          dropped.push(...describeDropped(dd, t.fromParent, [t.child]));
          al.list.splice(at++, 0, { labels: labelsFor(al.parent, pendingLabel), item: t.child.item });
        }
      }
      const n = droppedNotice(dropped);
      if (n) notices.push(n);
      // 沒有任何改變（拖到原來的位置）
      cleanup(dd);
      if (JSON.stringify(current(dd.items)) === before) return '位置沒有改變';
    },
    { anchors: true },
  );
}

/** ⌘]：項目 X 併入緊鄰的兄弟括號。 */
export function moveIntoSibling(doc: Doc, id: string, side: 'prev' | 'next'): Result {
  return run(doc, (d, notices) => {
    const dd = d as Doc;
    const loc = locate(dd, id);
    if (!loc) return '找不到項目';
    const j = loc.index + (side === 'next' ? 1 : -1);
    const sib = loc.list[j];
    if (!sib || sib.item.kind !== 'bracket') return '相鄰的項目不是括號';
    const x = loc.list[loc.index];
    const n = droppedNotice(describeDropped(dd, loc.parent, [x]));
    if (n) notices.push(n);
    const b = sib.item;
    const entry: Child = { labels: labelsFor(b, pendingLabel), item: x.item };
    loc.list.splice(loc.index, 1);
    if (side === 'next') b.children.unshift(entry);
    else b.children.push(entry);
  });
}

/** ⌘[：第一個或最後一個子項移出括號。 */
export function moveOutOfBracket(doc: Doc, id: string): Result {
  return run(doc, (d, notices) => {
    const dd = d as Doc;
    const loc = locate(dd, id);
    if (!loc || !loc.parent) return '這個項目不在括號裡';
    const b = loc.parent;
    const atFirst = loc.index === 0;
    const atLast = loc.index === loc.list.length - 1;
    if (!atFirst && !atLast) return '只有括號的第一個或最後一個子項可以移出';
    const bl = locate(dd, b.id)!;
    const x = loc.list[loc.index];
    const n = droppedNotice(describeDropped(dd, b, [x]));
    if (n) notices.push(n);
    loc.list.splice(loc.index, 1);
    const entry: Child = { labels: labelsFor(bl.parent, pendingLabel), item: x.item };
    bl.list.splice(atFirst ? bl.index : bl.index + 1, 0, entry);
  });
}

// ───────────────────────── 關係與標記 ─────────────────────────

function withBracket(doc: Doc, bracketId: string, fn: (b: Bracket, d: Doc, notices: string[]) => string | void): Result {
  return run(doc, (d, notices) => {
    const loc = locate(d as Doc, bracketId);
    const b = loc?.list[loc.index].item;
    if (!b || b.kind !== 'bracket') return '找不到這個括號';
    return fn(b, d as Doc, notices);
  });
}

const plainLabel = (): Label => ({ text: null, main: false, pending: false });

export function addRelation(doc: Doc, bracketId: string, typeId: string): Result {
  return withBracket(doc, bracketId, (b, d) => {
    const type = findType(d.relationTypes, typeId);
    if (!type) return '關係表裡沒有這個關係';
    const id = newId(d as unknown as D, 'q');
    b.relations.push({ id, type: typeId });
    b.children.forEach((c, i) => {
      c.labels[id] = { ...plainLabel(), main: type.hasMain === 'yes' && i === b.children.length - 1 };
    });
  });
}

export function removeRelation(doc: Doc, bracketId: string, relId: string): Result {
  return withBracket(doc, bracketId, (b) => {
    if (!b.relations.some((r) => r.id === relId)) return '找不到這個關係';
    b.relations = b.relations.filter((r) => r.id !== relId);
    for (const c of b.children) delete c.labels[relId];
  });
}

export function replaceRelation(doc: Doc, bracketId: string, relId: string, typeId: string): Result {
  return withBracket(doc, bracketId, (b, d) => {
    const rel = b.relations.find((r) => r.id === relId);
    const type = findType(d.relationTypes, typeId);
    if (!rel || !type) return '找不到這個關係';
    rel.type = typeId;
    if (type.hasMain === 'no') for (const c of b.children) c.labels[relId].main = false;
    else if (type.hasMain === 'yes' && !b.children.some((c) => c.labels[relId].main))
      b.children[b.children.length - 1].labels[relId].main = true;
  });
}

export function reorderRelations(doc: Doc, bracketId: string, order: string[]): Result {
  return withBracket(doc, bracketId, (b) => {
    if (order.length !== b.relations.length || !b.relations.every((r) => order.includes(r.id))) return '排序內容不符';
    b.relations = order.map((id) => b.relations.find((r) => r.id === id)!);
  });
}

export function setMain(doc: Doc, bracketId: string, relId: string, childId: string): Result {
  return withBracket(doc, bracketId, (b, d) => {
    const rel = b.relations.find((r) => r.id === relId);
    if (!rel) return '找不到這個關係';
    if (findType(d.relationTypes, rel.type)?.hasMain === 'no') return '這個關係沒有主句';
    if (!b.children.some((c) => c.item.id === childId)) return '指定的子項不在這個括號裡';
    for (const c of b.children) c.labels[relId].main = c.item.id === childId;
  });
}

/** 兩個子項：交換這個關係裡的主句和次要句。 */
export function swapMain(doc: Doc, bracketId: string, relId: string): Result {
  return withBracket(doc, bracketId, (b, d) => {
    const rel = b.relations.find((r) => r.id === relId);
    if (!rel) return '找不到這個關係';
    if (b.children.length !== 2) return '只有兩個子項時可以交換主次';
    if (findType(d.relationTypes, rel.type)?.hasMain === 'no') return '這個關係沒有主句';
    const [x, y] = b.children.map((c) => c.labels[relId]);
    if (x.main === y.main) {
      x.main = true;
      y.main = false;
    } else [x.main, y.main] = [y.main, x.main];
  });
}

/** text=null 表示「恢復預設」。 */
export function setLabelText(doc: Doc, bracketId: string, relId: string, childId: string, text: string | null): Result {
  return withBracket(doc, bracketId, (b) => {
    const c = b.children.find((x) => x.item.id === childId);
    if (!c || !c.labels[relId]) return '找不到這個標記';
    c.labels[relId].text = text;
    c.labels[relId].pending = false;
  });
}

export function setLabelPending(doc: Doc, bracketId: string, relId: string, childId: string, pending: boolean): Result {
  return withBracket(doc, bracketId, (b) => {
    const c = b.children.find((x) => x.item.id === childId);
    if (!c || !c.labels[relId]) return '找不到這個標記';
    c.labels[relId].pending = pending;
  });
}

// ───────────────────────── 檢查 ─────────────────────────

export interface Incomplete {
  unassignedBrackets: string[];
  pendingLabels: { bracketId: string; relId: string; childId: string }[];
  missingMain: { bracketId: string; relId: string }[];
}

/** 未完成項目（§4.1、§9.5）。「缺主句」不存檔，每次由資料算出來。 */
export function findIncomplete(doc: Doc): Incomplete {
  const out: Incomplete = { unassignedBrackets: [], pendingLabels: [], missingMain: [] };
  const walk = (list: Child[]) => {
    for (const c of list) {
      const it = c.item;
      if (it.kind !== 'bracket') continue;
      if (it.relations.length === 0) out.unassignedBrackets.push(it.id);
      for (const r of it.relations) {
        const type = findType(doc.relationTypes, r.type);
        for (const ch of it.children)
          if (ch.labels[r.id]?.pending) out.pendingLabels.push({ bracketId: it.id, relId: r.id, childId: ch.item.id });
        if (type?.hasMain === 'yes' && !it.children.some((ch) => ch.labels[r.id]?.main))
          out.missingMain.push({ bracketId: it.id, relId: r.id });
      }
      walk(it.children);
    }
  };
  walk(doc.items);
  return out;
}

export { firstRow };
