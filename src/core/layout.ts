import { findType, labelText } from './relations';
import { verseBlocks, type VerseBlock } from './verseblocks';
import { bracketHeight, firstRow, rowsInOrder } from './tree';
import type { Bracket, Child, Doc, Row, Seg } from './types';

// 版面（PLAN §9）：純函式，量測由外部（瀏覽器或測試）提供。單位 mm。

export interface Measurer {
  labelWidth(text: string, bold: boolean): number;
  labelHeight: number;
  /** 一行文字的高度（mm）。一列跨頁時，只在整數行的邊界切開。 */
  lineH: number;
  /** 一列的高度與分析欄第一行文字的垂直中線（相對列頂端）。 */
  measureRow(row: Row, analysisWidth: number, refWidths: Record<string, number>): { h: number; firstLineMid: number };
  /** 整節對照：把幾節的譯文依序疊在同一個區塊裡的總高度（每一節至少一行）。 */
  measureVerses(items: { tag: string; segs: Seg[] }[], width: number, colId?: string): number;
}

/** 整節對照欄裡的一個區塊：涵蓋一節（或共用同一行的幾節）的所有行。 */
export interface VerseBlockBox {
  colId: string;
  keys: string[];
  startRowId: string;
  x: number;
  w: number;
  page: number;
  y: number;
}

/** 一列跨頁時的一段（§9.2）：這一段畫在哪一頁的哪個位置，內容從列頂端往下 offset 的地方開始。 */
export interface RowFragment {
  page: number;
  y: number;
  h: number;
  offset: number;
}

export interface RowBox {
  id: string;
  /** 只有比一頁還高的列才會有（長度 ≥ 2）；page、y 是第一段的位置 */
  fragments?: RowFragment[];
  page: number;
  y: number;
  h: number;
  anchorY: number; // 頁面內容區座標
  textX: number; // 分析欄文字起點（含縮排）
  tooTall: boolean;
}

export interface Line {
  /** 這條線屬於哪個括號（垂直線與水平線都是；點擊選取用） */
  bracketId?: string;
  vertical?: boolean;
  page: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LabelBox {
  shared?: boolean;
  /** 所屬分支水平線的 y（頁面內容區座標）；整個括號共用的標記（以及、相比）為垂直線中點 */
  lineY: number;
  bracketId: string;
  childId: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  main: boolean;
  pending: boolean;
  custom: boolean;
}

export interface Flag {
  page: number;
  x: number;
  y: number;
  kind: 'missingMain' | 'unassigned';
}

export interface Layout {
  page: { w: number; h: number; contentW: number; contentH: number };
  titleH: number;
  treeW: number;
  analysisX: number;
  analysisW: number;
  refCols: { id: string; x: number; w: number }[];
  verseBlocks: VerseBlockBox[];
  pages: number;
  rows: RowBox[];
  lines: Line[];
  labels: LabelBox[];
  flags: Flag[];
  warnings: { narrow: boolean; tooTall: string[]; unresolvedLabels: number };
}

export const A4 = { w: 210, h: 297 };
const MIN_COL = 5;
const COL_PAD = 2;
const ROW_GAP = 0;
const TITLE_H = 10.4;
const NARROW_MM = 40;
/** 欄與欄之間的留白（mm）：量測與繪製的文字寬度都要扣掉，兩邊才排得一樣。 */
export const GUTTER = 1.5;

export function pageSize(doc: Doc) {
  const { orientation, margins } = doc.settings.page;
  const w = orientation === 'portrait' ? A4.w : A4.h;
  const h = orientation === 'portrait' ? A4.h : A4.w;
  // 內容區用「版面單位」（紙張尺寸 ÷ 版面縮放）：縮放 > 1 時，同一頁放得下較多內容（§9.4）
  const s = doc.settings.layoutScale || 1;
  return { w, h, contentW: (w - margins[1] - margins[3]) / s, contentH: (h - margins[0] - margins[2]) / s };
}

/** 沒有主句的關係（以及、或者、相比…）所有分支同等，標記整個括號只印一次（§6、參考表範例）。 */
function sharedRelation(doc: Doc, b: Bracket, relId: string): boolean {
  const r = b.relations.find((x) => x.id === relId);
  const type = r && findType(doc.relationTypes, r.type);
  if (!type) return false;
  return type.hasMain === 'no' || (type.hasMain === 'optional' && !b.children.some((c) => c.labels[relId]?.main));
}

function sharedLabel(doc: Doc, b: Bracket): { text: string; custom: boolean } {
  const parts: string[] = [];
  let custom = false;
  for (const r of b.relations) {
    if (!sharedRelation(doc, b, r.id)) continue;
    const type = findType(doc.relationTypes, r.type)!;
    const lab = b.children[0].labels[r.id];
    if (!lab) continue;
    const t = labelText(type, lab, doc.settings);
    custom = custom || lab.text !== null;
    if (t) parts.push(t);
  }
  return { text: parts.join(doc.settings.labelSeparator), custom };
}

function labelString(doc: Doc, b: Bracket, c: Child): string {
  const parts: string[] = [];
  for (const r of b.relations) {
    if (sharedRelation(doc, b, r.id)) continue;
    const type = findType(doc.relationTypes, r.type);
    const lab = c.labels[r.id];
    if (!type || !lab) continue;
    const t = labelText(type, lab, doc.settings);
    if (t) parts.push(t);
  }
  return parts.join(doc.settings.labelSeparator);
}

export function computeLayout(doc: Doc, m: Measurer): Layout {
  const pg = pageSize(doc);
  const rows = rowsInOrder(doc);
  const labelOf = new Map<string, { text: string; main: boolean; pending: boolean; custom: boolean }>();
  const colW: number[] = [];
  const roots = doc.items.map((c) => c.item).filter((i): i is Bracket => i.kind === 'bracket');
  const H = roots.reduce((h, b) => Math.max(h, bracketHeight(b)), 0);
  for (let i = 0; i < H; i++) colW.push(MIN_COL);

  // 1. 每個分支的標記文字與欄寬
  const walkLabels = (b: Bracket) => {
    const col = H - bracketHeight(b);
    colW[col] = Math.max(colW[col], m.labelWidth(sharedLabel(doc, b).text, false) + COL_PAD);
    for (const c of b.children) {
      const text = labelString(doc, b, c);
      const labs = b.relations.filter((r) => !sharedRelation(doc, b, r.id)).map((r) => c.labels[r.id]).filter(Boolean);
      const main = labs.some((l) => l.main);
      labelOf.set(c.item.id, {
        text,
        main,
        pending: labs.some((l) => l.pending),
        custom: labs.some((l) => l.text !== null),
      });
      colW[col] = Math.max(colW[col], m.labelWidth(text, main) + COL_PAD);
      if (c.item.kind === 'bracket') walkLabels(c.item);
    }
  };
  roots.forEach(walkLabels);
  const colX: number[] = [];
  let acc = 1 + (doc.settings.treePadLeft ?? 0);
  for (const w of colW) (colX.push(acc), (acc += w));
  const treeW = H ? acc : (doc.settings.treePadLeft ?? 0);

  // 2. 欄寬分配（§9.4）
  const refs = doc.settings.refColumns.filter((c) => c.visible);
  const refW = refs.map((c) => c.width * pg.contentW);
  const analysisW = pg.contentW - treeW - refW.reduce((a, b) => a + b, 0);
  const maxIndent = rows.reduce((a, r) => Math.max(a, r.indent), 0);
  const narrow = (analysisW - maxIndent * doc.settings.indentStep) * (doc.settings.layoutScale || 1) < NARROW_MM;
  const refCols: Layout['refCols'] = [];
  let rx = treeW + analysisW;
  refs.forEach((c, i) => (refCols.push({ id: c.id, x: rx, w: refW[i] }), (rx += refW[i])));
  const refWidths = Object.fromEntries(refCols.map((c) => [c.id, c.w - GUTTER]));

  // 3. 量測列高
  const meas = new Map<string, { h: number; mid: number }>();
  for (const r of rows) {
    const { h, firstLineMid } = m.measureRow(r, Math.max(1, analysisW - r.indent * doc.settings.indentStep - (refs.length ? GUTTER : 0)), refWidths);
    meas.set(r.id, { h, mid: firstLineMid });
  }

  // 3b. 整節對照：譯文比涵蓋的行加起來還高時，在這一節的最後一行下面補空間（§8）
  const vcols = refCols.filter((c) => doc.settings.refColumns.find((x) => x.id === c.id)!.mode === 'verse');
  const blocks = vcols.length ? verseBlocks(doc) : [];
  for (const col of vcols) {
    const store = doc.settings.refColumns.find((x) => x.id === col.id)!.verses ?? {};
    for (const b of blocks) {
      const need = m.measureVerses(b.keys.map((k) => ({ tag: k.split(':')[1], segs: store[k] ?? [] })), col.w - GUTTER, col.id);
      const have = rows.slice(b.start, b.end + 1).reduce((a, r) => a + meas.get(r.id)!.h, 0);
      if (need > have + 1e-6) meas.get(rows[b.end].id)!.h += need - have;
    }
  }
  // 一個區塊涵蓋的行要放在同一頁（不然譯文會被切到兩頁）
  const groups = new Map<number, number>();
  for (const b of blocks) if (b.end > b.start) groups.set(b.start, b.end);

  // 4. 分頁＋標記碰撞（列距只會加大，所以一定會停）
  const extra = new Map<string, number>();
  let result!: ReturnType<typeof place>;
  for (let iter = 0; iter < 40; iter++) {
    result = place(doc, rows, meas, extra, pg, treeW, colX, labelOf, m, groups, blocks, vcols);
    if (result.warnings.unresolvedLabels === 0 || !result.pendingFix.length) break;
    for (const id of result.pendingFix) extra.set(id, (extra.get(id) ?? 0) + 1);
  }
  const { pendingFix: _p, ...rest } = result;
  return {
    page: pg,
    titleH: TITLE_H,
    treeW,
    analysisX: treeW,
    analysisW,
    refCols,
    ...rest,
    warnings: { ...rest.warnings, narrow },
  };
}

function place(
  doc: Doc,
  rows: Row[],
  meas: Map<string, { h: number; mid: number }>,
  extra: Map<string, number>,
  pg: ReturnType<typeof pageSize>,
  treeW: number,
  colX: number[],
  labelOf: Map<string, { text: string; main: boolean; pending: boolean; custom: boolean }>,
  m: Measurer,
  groups: Map<number, number>,
  blocks: VerseBlock[],
  vcols: { id: string; x: number; w: number }[],
) {
  const step = doc.settings.indentStep;
  const boxes: RowBox[] = [];
  const tooTall: string[] = [];
  const usedH: number[] = [];
  let page = 0;
  let y = TITLE_H;
  const gapOf = (j: number) => (j === 0 ? 0 : ROW_GAP + (extra.get(rows[j].id) ?? 0));
  const inGroup = new Set<number>();
  for (const [s0, e0] of groups) for (let j = s0; j <= e0; j++) inGroup.add(j);
  const lineH = Math.max(m.lineH, 0.5);
  let hasContent = false; // 目前這一頁已經放了東西
  rows.forEach((r, i) => {
    const { h, mid } = meas.get(r.id)!;
    const gap = gapOf(i);
    // 比一頁還高、又不屬於整節區塊的列可以跨頁（§9.2）：至少要有 3 行的空間才在這一頁開始，否則整列從下一頁開始
    const splittable = h > pg.contentH + 1e-6 && !inGroup.has(i);
    // 整節區塊的第一行：整個區塊要放得下才留在這一頁
    let need = h;
    const gEnd = groups.get(i);
    if (gEnd !== undefined) for (let j = i + 1; j <= gEnd; j++) need += gapOf(j) + meas.get(rows[j].id)!.h;
    if (splittable) need = Math.min(h, 3 * lineH);
    const fits = y + gap + need <= pg.contentH;
    if (i > 0 && (r.pageBreakBefore || (!fits && hasContent))) {
      usedH[page] = y;
      page++;
      y = 0;
      hasContent = false;
    } else y += gap;

    if (splittable) {
      const frags: RowFragment[] = [];
      let remaining = h;
      let offset = 0;
      for (;;) {
        const avail = pg.contentH - y;
        const fh = remaining <= avail + 1e-6 ? remaining : Math.max(lineH, Math.floor(avail / lineH + 1e-6) * lineH);
        frags.push({ page, y, h: fh, offset });
        remaining -= fh;
        offset += fh;
        if (remaining <= 1e-6) {
          y += fh;
          break;
        }
        usedH[page] = y + fh;
        page++;
        y = 0;
      }
      boxes.push({ id: r.id, page: frags[0].page, y: frags[0].y, h, anchorY: frags[0].y + mid, textX: treeW + r.indent * step, tooTall: false, fragments: frags });
      hasContent = true;
      return;
    }
    const tall = y + h > pg.contentH;
    if (tall) tooTall.push(r.id);
    boxes.push({ id: r.id, page, y, h, anchorY: y + mid, textX: treeW + r.indent * step, tooTall: tall });
    y += h;
    hasContent = true;
  });
  usedH[page] = y;
  // 區塊比一頁還高、或被手動分頁點切開：譯文會超出頁面，標成超高列擋下輸出
  for (const [s0, e0] of groups) {
    const a = boxes[s0];
    const z = boxes[e0];
    if ((a.page !== z.page || z.y + z.h > pg.contentH) && !a.tooTall) {
      a.tooTall = true;
      tooTall.push(a.id);
    }
  }
  const verseBoxes: VerseBlockBox[] = [];
  for (const col of vcols)
    for (const b of blocks) {
      const a = boxes[b.start];
      verseBoxes.push({ colId: col.id, keys: b.keys, startRowId: a.id, x: col.x, w: col.w - GUTTER, page: a.page, y: a.y });
    }
  const box = new Map(boxes.map((b) => [b.id, b]));
  const G = (rb: { page: number; y: number }) => rb.page * pg.contentH + rb.y; // 連續座標

  const lines: Line[] = [];
  const labels: LabelBox[] = [];
  const flags: Flag[] = [];
  const hlines: Line[] = [];

  const addVertical = (x: number, g1: number, g2: number, bracketId: string) => {
    const p1 = Math.floor(g1 / pg.contentH);
    const p2 = Math.floor(g2 / pg.contentH);
    for (let p = p1; p <= p2; p++) {
      const top = p === p1 ? g1 - p * pg.contentH : 0;
      const bottom = p === p2 ? g2 - p * pg.contentH : pg.contentH;
      lines.push({ bracketId, vertical: true, page: p, x1: x, y1: top, x2: x, y2: bottom });
    }
  };

  /** 回傳這一項接線的位置（連續座標）。 */
  const attach = (b: Bracket): number => {
    const col = colX[bracketHeight(b) ? colX.length - bracketHeight(b) : 0];
    const pts = b.children.map((c) => (c.item.kind === 'row' ? G({ page: box.get(c.item.id)!.page, y: box.get(c.item.id)!.anchorY }) : attach(c.item)));
    const g1 = pts[0];
    const g2 = pts[pts.length - 1];
    addVertical(col, g1, g2, b.id);
    // 中點；落在某一頁底部空白處時，放到該頁最後一列的位置
    let mid = (g1 + g2) / 2;
    const p = Math.floor(mid / pg.contentH);
    const used = usedH[p] ?? pg.contentH;
    if (mid - p * pg.contentH > used) {
      const last = [...boxes].reverse().find((r) => r.page === p);
      if (last) mid = G({ page: p, y: last.anchorY });
    }
    b.children.forEach((c, i) => {
      const gy = pts[i];
      const pageOf = Math.floor(gy / pg.contentH);
      const yy = gy - pageOf * pg.contentH;
      const targetX = c.item.kind === 'row' ? box.get(c.item.id)!.textX : colX[colX.length - bracketHeight(c.item)];
      const ln: Line = { bracketId: b.id, page: pageOf, x1: col, y1: yy, x2: targetX, y2: yy };
      lines.push(ln);
      hlines.push(ln);
      const lab = labelOf.get(c.item.id);
      // 參考表的慣例：最後一個分支的標記放在水平線上方，其餘放在下方
      const above = i === b.children.length - 1;
      const text = lab?.text ? lab.text : lab?.pending ? '?' : '';
      if (lab && text) {
        const h = m.labelHeight;
        labels.push({
          lineY: yy, bracketId: b.id, childId: c.item.id, page: pageOf, x: col + 0.5, y: above ? yy - 0.4 - h : yy + 0.4,
          w: m.labelWidth(text, lab.main), h, text, main: lab.main, pending: !lab.text && lab.pending, custom: lab.custom,
        });
      }
    });
    const shared = sharedLabel(doc, b);
    if (shared.text) {
      const pageOf = Math.floor(mid / pg.contentH);
      const yy = mid - pageOf * pg.contentH;
      const h = m.labelHeight;
      labels.push({
        lineY: yy, shared: true, bracketId: b.id, childId: b.children[0].item.id, page: pageOf, x: col + 0.5, y: yy - h / 2,
        w: m.labelWidth(shared.text, false), h, text: shared.text, main: false, pending: false, custom: shared.custom,
      });
    }
    const parentCol = col;
    void parentCol;
    return mid;
  };
  // attach() 回傳值要代表「這個括號被父括號接上的位置」，所以用 pts 的中點。
  // 這裡再包一層，讓遞迴時子括號回傳中點。
  const roots = doc.items.map((c) => c.item);
  for (const it of roots) {
    if (it.kind === 'bracket') attach(it);
    else void firstRow(it);
  }

  // 碰撞：先放下方，再試上方，最後回報要加大的列距
  const fix: string[] = [];
  let unresolved = 0;
  const hit = (a: LabelBox, others: LabelBox[]) =>
    others.some((o) => o !== a && o.page === a.page && a.x < o.x + o.w && o.x < a.x + a.w && a.y < o.y + o.h && o.y < a.y + a.h) ||
    hlines.some((l) => l.page === a.page && l.y1 > a.y && l.y1 < a.y + a.h && l.x1 < a.x + a.w && l.x2 > a.x);
  for (const l of labels) {
    if (!hit(l, labels)) continue;
    const orig = l.y;
    if (!l.shared) {
      l.y = l.y > l.lineY ? l.lineY - 0.4 - l.h : l.lineY + 0.4;
      if (!hit(l, labels)) continue;
    }
    l.y = orig;
    unresolved++;
    const near = boxes.filter((r) => r.page === l.page).sort((a, b) => Math.abs(a.anchorY - l.y) - Math.abs(b.anchorY - l.y))[0];
    const idx = near ? rows.findIndex((r) => r.id === near.id) : -1;
    if (idx >= 0 && idx + 1 < rows.length) fix.push(rows[idx + 1].id);
  }

  // 缺主句／未指定關係的提示（§4.1，只在螢幕顯示）
  const walkFlags = (b: Bracket) => {
    const rb = box.get(firstRow(b).id)!;
    const x = colX[colX.length - bracketHeight(b)];
    const missing = b.relations.some((r) => {
      const t = findType(doc.relationTypes, r.type);
      return t?.hasMain === 'yes' && !b.children.some((c) => c.labels[r.id]?.main);
    });
    if (missing) flags.push({ page: rb.page, x, y: rb.anchorY - 3, kind: 'missingMain' });
    if (b.relations.length === 0) flags.push({ page: rb.page, x, y: rb.anchorY - 3, kind: 'unassigned' });
    for (const c of b.children) if (c.item.kind === 'bracket') walkFlags(c.item);
  };
  roots.forEach((it) => it.kind === 'bracket' && walkFlags(it));

  return {
    pages: page + 1,
    verseBlocks: verseBoxes,
    rows: boxes,
    lines,
    labels,
    flags,
    pendingFix: fix,
    warnings: { narrow: false, tooTall, unresolvedLabels: unresolved },
  };
}
