import { describe, expect, it } from 'vitest';
import { Builder, T, V } from '../src/core/builder';
import * as C from '../src/core/commands';
import { computeLayout, type Measurer } from '../src/core/layout';
import { planRefPaste, resolvePlan } from '../src/core/refpaste';
import { rowsInOrder, segsText } from '../src/core/tree';
import { validate } from '../src/core/validate';
import { verseBlocks } from '../src/core/verseblocks';
import type { Doc } from '../src/core/types';

const LINE = 5;
const meas: Measurer = {
  labelWidth: (t) => t.length * 2,
  labelHeight: 2.5,
  lineH: LINE,
  measureVerses: (items, w) => items.reduce((a, t) => a + Math.max(1, Math.ceil((segsText(t.segs).length * 2) / Math.max(w, 1))) * LINE, 0),
  measureRow: () => ({ h: LINE, firstLineMid: LINE / 2 }),
};

/** 第 16 節跨 3 行（a,b,c）；第 17、18 節同在一行 d；第 19 節跨 2 行（e,f） */
function make(): { doc: Doc; ids: string[] } {
  const b = new Builder();
  const a = b.row([V(16), T('a')]);
  const bb = b.row('b');
  const c = b.row('c');
  const d = b.row([V(17), T('d'), V(18), T('d2')]);
  const e = b.row([V(19), T('e')]);
  const f = b.row('f');
  const doc = b.build([a, bb, c, d, e, f]);
  doc.meta.startChapter = 3;
  doc.settings.page.orientation = 'landscape';
  doc.settings.refColumns = [{ id: 'c1', lang: 'en', visible: true, width: 0.3, mode: 'verse' }];
  return { doc, ids: [a.id, bb.id, c.id, d.id, e.id, f.id] };
}

describe('整節對照：區塊', () => {
  it('一節涵蓋的所有行成為一個區塊；同一行含好幾節時共用一個區塊', () => {
    const { doc } = make();
    expect(verseBlocks(doc)).toEqual([
      { start: 0, end: 2, keys: ['3:16'] },
      { start: 3, end: 3, keys: ['3:17', '3:18'] },
      { start: 4, end: 5, keys: ['3:19'] },
    ]);
  });
  it('分析欄拆行不影響區塊歸屬（歸屬由經節標記決定）', () => {
    const { doc, ids } = make();
    const sp = C.splitRow(doc, ids[1], { seg: 0, off: 0 });
    if ('error' in sp) throw new Error();
    const bl = verseBlocks(sp.doc);
    expect(bl[0]).toEqual({ start: 0, end: 3, keys: ['3:16'] });
  });
});

describe('整節對照：內容與編輯', () => {
  it('依經節存放；拆行、合併、刪行都不影響已存的譯文', () => {
    let { doc, ids } = make();
    const r = C.setVerseText(doc, 'c1', '3:16', [T('For God so loved')]);
    if ('error' in r) throw new Error(r.error);
    doc = r.doc;
    expect(validate(doc)).toEqual([]);
    const sp = C.splitRow(doc, ids[0], { seg: 1, off: 0 });
    const mg = C.mergeWithPrev(doc, ids[2]);
    const del = C.deleteRows(doc, [ids[1]]);
    for (const x of [sp, mg, del]) {
      if ('error' in x) throw new Error(x.error);
      expect(segsText(x.doc.settings.refColumns[0].verses!['3:16'])).toBe('For God so loved');
    }
  });
  it('只能寫進整節對照欄；清空就移除', () => {
    let { doc } = make();
    doc.settings.refColumns[0].mode = 'row';
    expect('error' in C.setVerseText(doc, 'c1', '3:16', [T('x')])).toBe(true);
    ({ doc } = make());
    const r = C.setVerseText(doc, 'c1', '3:16', [T('x')]);
    if ('error' in r) throw new Error();
    const cleared = C.setVerseText(r.doc, 'c1', '3:16', []);
    if ('error' in cleared) throw new Error();
    expect(cleared.doc.settings.refColumns[0].verses).toEqual({});
  });
  it('切換成逐行再切回來，兩種模式的內容都保留', () => {
    let { doc } = make();
    const r = C.setVerseText(doc, 'c1', '3:17', [T('keep')]);
    if ('error' in r) throw new Error();
    const rowMode = C.setSettings(r.doc, { ...r.doc.settings, refColumns: [{ ...r.doc.settings.refColumns[0], mode: 'row' }] });
    if ('error' in rowMode) throw new Error();
    const back = C.setSettings(rowMode.doc, { ...rowMode.doc.settings, refColumns: [{ ...rowMode.doc.settings.refColumns[0], mode: 'verse' }] });
    if ('error' in back) throw new Error();
    expect(segsText(back.doc.settings.refColumns[0].verses!['3:17'])).toBe('keep');
  });
  it('貼上：依經節號直接放進各節，找不到的列出來', () => {
    const { doc, ids } = make();
    const plan = planRefPaste(doc, 'c1', ids[0], '16 aaa\n17 bbb\n18 ccc\n19 ddd', 'verse');
    expect(plan.byVerse).toBe(true);
    expect(plan.targets.map((t) => t.key)).toEqual(['3:16', '3:17', '3:18', '3:19']);
    const cells = resolvePlan(doc, plan, { defaultExisting: 'overwrite', leftover: 'merge-last' })!;
    const res = C.setVerseCells(doc, 'c1', cells);
    if ('error' in res) throw new Error(res.error);
    expect(Object.keys(res.doc.settings.refColumns[0].verses!)).toEqual(['3:16', '3:17', '3:18', '3:19']);
    const plan2 = planRefPaste(doc, 'c1', ids[0], '19 x\n20 y', 'verse'); // 第 20 節文件裡沒有
    expect(plan2.leftovers.map((l) => l.label)).toEqual(['找不到第 3:20 節對應的行']); // 文件裡沒有第 20 節：列出來，不丟掉
  });
});

describe('整節對照：版面', () => {
  it('區塊放在涵蓋它的第一行；譯文比涵蓋的行高時，在最後一行下面補空間', () => {
    let { doc } = make();
    const long = 'x'.repeat(200); // 欄寬很窄，譯文會折成很多行
    const r = C.setVerseText(doc, 'c1', '3:19', [T(long)]);
    if ('error' in r) throw new Error();
    doc = r.doc;
    const L = computeLayout(doc, meas);
    const blk = L.verseBlocks.find((b) => b.keys[0] === '3:19')!;
    const rows = L.rows;
    expect(blk.startRowId).toBe(rows[4].id);
    expect(blk.y).toBe(rows[4].y);
    const needed = meas.measureVerses([{ tag: '19', segs: [T(long)] }], blk.w);
    expect(needed).toBeGreaterThan(2 * LINE); // 原本兩行放不下
    expect(rows[4].h + rows[5].h).toBeCloseTo(needed, 5); // 補空間後剛好夠
    expect(rows[5].h).toBeGreaterThan(LINE); // 補在最後一行
    expect(rows[4].h).toBe(LINE);
  });
  it('一行含好幾節：兩節的譯文依序疊在同一個區塊', () => {
    const { doc } = make();
    const L = computeLayout(doc, meas);
    const blk = L.verseBlocks.find((b) => b.keys.includes('3:17'))!;
    expect(blk.keys).toEqual(['3:17', '3:18']);
    // 兩節各至少一行：這一行被撐高成兩行
    expect(L.rows[3].h).toBeCloseTo(2 * LINE, 5);
  });
  it('區塊涵蓋的行不會被分頁切開：放不下就整塊移到下一頁', () => {
    const { doc, ids } = make();
    // 內容區高 31mm：標題 10.4 + 約 4 行；16 節（3 行）放得下，之後 2 行高的區塊放不下就整塊換頁
    doc.settings.page.margins = [0, 0, 297 - 31, 0];
    doc.settings.page.orientation = 'portrait';
    const L = computeLayout(doc, meas);
    const pageOf = (id: string) => L.rows.find((r) => r.id === id)!.page;
    // 同一個區塊的行一定在同一頁
    for (const b of verseBlocks(doc)) {
      const pages = new Set(rowsInOrder(doc).slice(b.start, b.end + 1).map((r) => pageOf(r.id)));
      expect(pages.size).toBe(1);
    }
    expect(L.pages).toBeGreaterThan(1);
    void ids;
  });
  it('逐行欄不受影響：沒有整節欄時沒有區塊', () => {
    const { doc } = make();
    doc.settings.refColumns[0].mode = 'row';
    expect(computeLayout(doc, meas).verseBlocks).toEqual([]);
  });
});
