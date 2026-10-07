import { describe, expect, it } from 'vitest';
import { Builder, T, V } from '../src/core/builder';
import * as C from '../src/core/commands';
import { planRefPaste, resolvePlan, suggestMode } from '../src/core/refpaste';
import { rowsInOrder, segsText } from '../src/core/tree';
import { validate } from '../src/core/validate';
import type { Doc } from '../src/core/types';

function make(): { doc: Doc; ids: string[] } {
  const b = new Builder();
  const r1 = b.row([V(16), T('A')]);
  const r2 = b.row('B');
  const r3 = b.row([V(17), T('C'), V(18), T('D')]);
  const r4 = b.row('E');
  const doc = b.build([r1, r2, r3, r4]);
  doc.settings.refColumns = [{ id: 'c1', lang: 'en', visible: true, width: 0.25, mode: 'row' }];
  return { doc, ids: [r1.id, r2.id, r3.id, r4.id] };
}
const ch = { defaultExisting: 'overwrite' as const, leftover: 'merge-last' as const };
const cells = (d: Doc) => rowsInOrder(d).map((r) => segsText(r.refs.c1 ?? []));

describe('貼上到對照欄：逐格貼上', () => {
  it('從目前這一格開始依序往下填，空白行跳過', () => {
    const { doc, ids } = make();
    const plan = planRefPaste(doc, 'c1', ids[1], 'x\n\ny', 'cells');
    expect(plan.targets.map((t) => [t.key, t.text])).toEqual([[ids[1], 'x'], [ids[3], 'y']]);
    const res = C.setRefCells(doc, 'c1', resolvePlan(doc, plan, ch)!.map((c) => ({ rowId: c.key, segs: c.segs })));
    if ('error' in res) throw new Error(res.error);
    expect(validate(res.doc)).toEqual([]);
    expect(cells(res.doc)).toEqual(['', 'x', '', 'y']);
  });
  it('已經有內容的格子：覆蓋、接在後面、略過', () => {
    let { doc, ids } = make();
    const r = C.setRefCells(doc, 'c1', [{ rowId: ids[0], segs: [T('old')] }]);
    if ('error' in r) throw new Error();
    doc = r.doc;
    const plan = planRefPaste(doc, 'c1', ids[0], 'new', 'cells');
    expect(plan.targets[0].existing).toBe('old');
    const get = (p: 'overwrite' | 'append' | 'skip') => {
      const cs = resolvePlan(doc, plan, { ...ch, defaultExisting: p })!;
      return cs.length ? segsText(cs[0].segs) : '(不動)';
    };
    expect(get('overwrite')).toBe('new');
    expect(get('append')).toBe('old new');
    expect(get('skip')).toBe('(不動)');
  });
  it('超出最後一行的文字：併入最後一行，或取消', () => {
    const { doc, ids } = make();
    const plan = planRefPaste(doc, 'c1', ids[3], 'p\nq\nr', 'cells');
    expect(plan.leftovers.map((l) => l.text)).toEqual(['q', 'r']);
    expect(resolvePlan(doc, plan, { ...ch, leftover: 'cancel' })).toBeNull();
    const cs = resolvePlan(doc, plan, ch)!;
    expect(cs.map((c) => segsText(c.segs))).toEqual(['p q r']);
  });
});

describe('貼上到對照欄：依經節對齊', () => {
  it('每一節放到包含這一節的第一行；一行含多節時依序放在同一格', () => {
    const { doc, ids } = make();
    const text = '16For God so loved\n17For God sent\n18He who believes';
    expect(suggestMode(doc, text)).toBe('verse');
    const plan = planRefPaste(doc, 'c1', ids[0], text, 'verse');
    expect(plan.leftovers).toEqual([]);
    expect(plan.targets.map((t) => [t.key, t.verses])).toEqual([[ids[0], ['3:16']], [ids[2], ['3:17', '3:18']]]);
    const res = C.setRefCells(doc, 'c1', resolvePlan(doc, plan, ch)!.map((c) => ({ rowId: c.key, segs: c.segs })));
    if ('error' in res) throw new Error();
    expect(cells(res.doc)).toEqual(['For God so loved', '', 'For God sent He who believes', '']);
  });
  it('找不到對應行的經節與開頭的文字：列出來，可併入最後一行', () => {
    const { doc, ids } = make();
    const plan = planRefPaste(doc, 'c1', ids[0], 'intro\n16 a\n17 b\n19 c', 'verse');
    // 19 與 17、16 不連續：只辨識 16、17
    expect(plan.leftovers.map((l) => l.label)).toContain('開頭沒有經節號的文字');
    const cs = resolvePlan(doc, plan, ch)!;
    expect(cs.find((c) => c.key === ids[3])).toBeTruthy();
  });
  it('沒有經節號時回報錯誤', () => {
    const { doc, ids } = make();
    expect(planRefPaste(doc, 'c1', ids[0], 'no verses here', 'verse').error).toBeTruthy();
    expect(suggestMode(doc, 'no verses here')).toBe('cells');
  });
  it('分析欄怎麼拆行都不影響結果（依經節存放）', () => {
    const { doc, ids } = make();
    const split = C.splitRow(doc, ids[0], { seg: 1, off: 0 });
    if ('error' in split) throw new Error();
    const plan = planRefPaste(split.doc, 'c1', ids[0], '16 x\n17 y', 'verse');
    expect(plan.targets[0].key).toBe(ids[0]); // 第 16 節仍在第一行（含節號的那行）
  });
});

describe('對照欄與拆行／合併（§4.3）', () => {
  it('拆行：對照欄文字留在 R1，R2 是空的；合併：R2 的文字接到 R1 後面不遺失', () => {
    const { doc, ids } = make();
    const filled = C.setRefCells(doc, 'c1', [{ rowId: ids[1], segs: [T('hello')] }, { rowId: ids[2], segs: [T('world')] }]);
    if ('error' in filled) throw new Error();
    const sp = C.splitRow(filled.doc, ids[1], { seg: 0, off: 0 });
    if ('error' in sp) throw new Error();
    const rs = rowsInOrder(sp.doc);
    expect(segsText(rs[1].refs.c1)).toBe('hello');
    expect(segsText(rs[2].refs.c1 ?? [])).toBe('');
    const mg = C.mergeWithPrev(filled.doc, ids[2]);
    if ('error' in mg) throw new Error();
    expect(segsText(rowsInOrder(mg.doc)[1].refs.c1)).toBe('hello world');
  });
  it('移除對照欄時，各行對應的內容一起移除，檔案仍通過驗證', () => {
    const { doc, ids } = make();
    const filled = C.setRefCells(doc, 'c1', [{ rowId: ids[0], segs: [T('x')] }]);
    if ('error' in filled) throw new Error();
    const rm = C.setSettings(filled.doc, { ...filled.doc.settings, refColumns: [] });
    if ('error' in rm) throw new Error();
    expect(validate(rm.doc)).toEqual([]);
    expect(rowsInOrder(rm.doc)[0].refs).toEqual({});
  });
});
