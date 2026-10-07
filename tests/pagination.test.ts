import { describe, expect, it } from 'vitest';
import { computeLayout, type Layout, type Measurer } from '../src/core/layout';
import { stressDoc } from '../src/core/sample';
import { rowsInOrder, segsText } from '../src/core/tree';
import { validate } from '../src/core/validate';
import type { Doc } from '../src/core/types';

// 驗收項目 3 的自動化部分：長段、三欄、跨頁。量測用簡化的假字型（每個字 2mm 寬）。
const CHAR = 2;
const LINE = 5.3;
const meas: Measurer = {
  labelWidth: (t) => t.length * 2,
  labelHeight: 2.5,
  lineH: LINE,
  measureVerses: (items, w) => items.reduce((a, t) => a + Math.max(1, Math.ceil((segsText(t.segs).length * CHAR) / Math.max(w, 1))) * LINE, 0),
  measureRow: (row, aw, refW) => {
    const lines = (text: string, w: number) => Math.max(1, Math.ceil((text.length * CHAR) / Math.max(w, 1)));
    let h = lines(segsText(row.main), aw) * LINE;
    for (const [k, w] of Object.entries(refW)) h = Math.max(h, lines(segsText(row.refs[k] ?? []), w) * LINE);
    return { h, firstLineMid: LINE / 2 };
  },
};

function check(doc: Doc, L: Layout) {
  const rows = rowsInOrder(doc);
  // 每一列剛好在一頁上，順序不亂
  expect(L.rows.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  let prevPage = 0;
  for (const r of L.rows) {
    expect(r.page).toBeGreaterThanOrEqual(prevPage);
    prevPage = r.page;
    // 沒有超高的列一定完整落在內容區內（不被切到兩頁）
    if (!r.tooTall && !r.fragments) {
      expect(r.y + r.h).toBeLessThanOrEqual(L.page.contentH + 1e-6);
      expect(r.y).toBeGreaterThanOrEqual(0);
    }
  }
  // 每一頁至少有一列（或某一列的一段）：不會有空白頁
  for (let p = 0; p < L.pages; p++) expect(L.rows.some((r) => r.page === p || r.fragments?.some((f) => f.page === p))).toBe(true);
  // 同一頁的列不重疊
  for (let i = 1; i < L.rows.length; i++) {
    const a = L.rows[i - 1];
    const b = L.rows[i];
    const aEnd = a.fragments ? a.fragments[a.fragments.length - 1] : { page: a.page, y: a.y, h: a.h };
    if (aEnd.page === b.page) expect(b.y).toBeGreaterThanOrEqual(aEnd.y + aEnd.h - 1e-6);
  }
  // 線與標記都落在頁面內容區裡
  for (const l of L.lines) {
    expect(l.page).toBeGreaterThanOrEqual(0);
    expect(l.page).toBeLessThan(L.pages);
    expect(l.y1).toBeGreaterThanOrEqual(-1e-6);
    expect(l.y2).toBeLessThanOrEqual(L.page.contentH + 1e-6);
  }
  expect(L.labels.every((b) => b.page >= 0 && b.page < L.pages)).toBe(true);
}

describe('跨頁壓力測試（驗收項目 3）', () => {
  it('範例資料重複後是合法文件，行數 ≥ 40', () => {
    const d = stressDoc(2);
    expect(validate(d)).toEqual([]);
    expect(rowsInOrder(d).length).toBe(70);
    expect(d.settings.refColumns.filter((c) => c.visible).length).toBe(2);
  });

  for (const orientation of ['portrait', 'landscape'] as const) {
    it(`${orientation === 'portrait' ? '直向' : '橫向'}：自動分頁正確，超過 2 頁`, () => {
      const d = stressDoc(2);
      d.settings.page.orientation = orientation;
      if (orientation === 'portrait') d.settings.refColumns.forEach((c) => (c.width = 0.1)); // 直向縮窄對照欄才放得下
      const L = computeLayout(d, meas);
      expect(L.pages).toBeGreaterThanOrEqual(2);
      check(d, L);
      expect(L.warnings.tooTall).toEqual([]);
    });
  }

  it('跨頁的括號：垂直線在每一頁都接得起來（上一頁畫到內容區底部，下一頁從頂部接著畫）', () => {
    const d = stressDoc(3);
    const L = computeLayout(d, meas);
    expect(L.pages).toBeGreaterThanOrEqual(3);
    const root = L.lines.filter((l) => l.bracketId === 'stress-root' && l.vertical).sort((a, b) => a.page - b.page);
    expect(root.length).toBeGreaterThanOrEqual(3);
    // 括號只畫在它第一個與最後一個分支之間的頁面，而且頁面是連續的
    root.forEach((seg, i) => {
      if (i > 0) expect(seg.page).toBe(root[i - 1].page + 1);
      if (i > 0) expect(seg.y1).toBeCloseTo(0, 5); // 下一頁從內容區頂部接著畫
      if (i < root.length - 1) expect(seg.y2).toBeCloseTo(L.page.contentH, 5); // 這一頁畫到底
    });
    // 同一括號所有分頁的垂直線 x 一致
    expect(new Set(root.map((s) => s.x1)).size).toBe(1);
  });

  it('手動分頁點：該列一定是新一頁的第一列', () => {
    const d = stressDoc(2);
    const rows = rowsInOrder(d);
    const target = structuredClone(d);
    const t = rowsInOrder(target)[10];
    t.pageBreakBefore = true;
    const L = computeLayout(target, meas);
    check(target, L);
    const box = L.rows.find((r) => r.id === t.id)!;
    expect(box.page).toBeGreaterThan(L.rows.find((r) => r.id === rows[9].id)!.page);
    expect(box.y).toBe(0);
  });

  it('寬度不夠時有提示：三欄直向放不下，改成橫向就解除', () => {
    const d = stressDoc(2);
    expect(computeLayout(d, meas).warnings.narrow).toBe(false); // 預設橫向
    d.settings.page.orientation = 'portrait';
    expect(computeLayout(d, meas).warnings.narrow).toBe(true);
    d.settings.refColumns.forEach((c) => (c.visible = false));
    expect(computeLayout(d, meas).warnings.narrow).toBe(false);
  });

  it('一列比一頁還高：跨頁切開（只在整行的邊界），不被擋下', () => {
    const d = stressDoc(2);
    const rows = rowsInOrder(d);
    rows[20].refs.c1 = [{ t: 'text', text: 'x'.repeat(4000), marks: [] }];
    const L = computeLayout(d, meas);
    expect(L.warnings.tooTall).toEqual([]);
    check(d, L);
    const box = L.rows.find((r) => r.id === rows[20].id)!;
    const fr = box.fragments!;
    expect(fr.length).toBeGreaterThanOrEqual(2);
    // 各段加起來剛好是整列高度，內容從上往下接續（offset 連續）
    expect(fr.reduce((a, f) => a + f.h, 0)).toBeCloseTo(box.h, 5);
    fr.forEach((f, i) => {
      expect(f.offset).toBeCloseTo(fr.slice(0, i).reduce((a, g) => a + g.h, 0), 5);
      expect(f.y + f.h).toBeLessThanOrEqual(L.page.contentH + 1e-6); // 每一段都在內容區裡
      if (i > 0) {
        expect(f.page).toBe(fr[i - 1].page + 1);
        expect(f.y).toBe(0); // 後面的段從下一頁頂端開始
      }
      if (i < fr.length - 1) expect(f.h / LINE).toBeCloseTo(Math.round(f.h / LINE), 5); // 在整行的邊界切開
    });
    expect(box.page).toBe(fr[0].page);
    // 下一列接在最後一段後面（同一頁、緊接著）
    const next = L.rows[L.rows.findIndex((r) => r.id === box.id) + 1];
    const last = fr[fr.length - 1];
    expect(next.page).toBe(last.page);
    expect(next.y).toBeGreaterThanOrEqual(last.y + last.h - 1e-6);
    // 比一頁矮的列仍然不會被切開
    expect(L.rows.filter((r) => r.fragments).length).toBe(1);
  });

  it('跨頁列在這一頁剩下的空間不到 3 行時，整列從下一頁開始', () => {
    const d = stressDoc(1);
    d.settings.refColumns = [d.settings.refColumns[0]];
    const rows = rowsInOrder(d);
    const huge = [{ t: 'text' as const, text: 'x'.repeat(4000), marks: [] }];
    rows[3].refs.c1 = huge;
    const L1 = computeLayout(d, meas);
    const b1 = L1.rows.find((r) => r.id === rows[3].id)!;
    expect(b1.fragments).toBeTruthy();
    // 在這一頁開始（前面的列還沒把頁面填滿）
    expect(b1.fragments![0].page).toBe(L1.rows[2].page);
    // 縮小內容區，讓前面的列把頁面填到只剩 < 3 行：整列移到下一頁
    const d2 = structuredClone(d);
    d2.settings.page.margins = [0, 0, 297 - (10.4 + 3 * LINE * 1.4), 0]; // 內容區高約 10.4 + 4.2 行
    const L2 = computeLayout(d2, meas);
    const b2 = L2.rows.find((r) => r.id === rows[3].id)!;
    const prev = L2.rows[2];
    if (b2.fragments![0].page === prev.page) expect(L2.page.contentH - (prev.y + prev.h)).toBeGreaterThanOrEqual(3 * LINE - 1e-6);
  });

  it('整節區塊比一頁還高：不能跨頁，仍然擋下輸出', () => {
    const d = stressDoc(1);
    d.settings.refColumns = [{ ...d.settings.refColumns[0], mode: 'verse', verses: { '3:14': [{ t: 'text', text: 'y'.repeat(6000), marks: [] }] } }];
    const L = computeLayout(d, meas);
    expect(L.warnings.tooTall.length).toBeGreaterThan(0);
  });
});
