import { describe, expect, it } from 'vitest';
import { Builder } from '../src/core/builder';
import * as C from '../src/core/commands';
import { computeLayout, type Measurer } from '../src/core/layout';
import { preflight } from '../src/core/preflight';
import { sampleJohn3 } from '../src/core/sample';
import { validate, validateSettings } from '../src/core/validate';

const meas = (rowH = 6): Measurer => ({
  labelWidth: (t) => t.length * 2,
  labelHeight: 2.5,
  lineH: rowH,
  measureVerses: (items) => items.length * rowH,
  measureRow: () => ({ h: rowH, firstLineMid: rowH / 2 }),
});

describe('匯出前檢查（§9.5）', () => {
  it('完整的文件沒有任何項目', () => {
    const doc = sampleJohn3();
    const p = preflight(doc, computeLayout(doc, meas()), true);
    expect(p.blocking).toEqual([]);
    expect(p.soft).toEqual([]);
  });
  it('一列比一頁還高：自動跨頁，不再擋下輸出', () => {
    const b = new Builder();
    const a = b.row('a');
    const tall = b.row('tall');
    const doc = b.build([a, tall]);
    const m: Measurer = { ...meas(), measureRow: (r) => ({ h: r.id === tall.id ? 400 : 6, firstLineMid: 3 }) };
    const L = computeLayout(doc, m);
    expect(L.rows.find((r) => r.id === tall.id)!.fragments!.length).toBeGreaterThan(1);
    expect(preflight(doc, L, true).blocking).toEqual([]);
  });
  it('字型沒載入完成會擋下輸出', () => {
    expect(preflight(sampleJohn3(), null, false).blocking[0].kind).toBe('fonts');
  });
  it('未指定關係、待判定、缺主句、版面過窄只提醒，不擋', () => {
    const b = new Builder();
    const x = b.row('x'), y = b.row('y'), z = b.row('z');
    let d = b.build([b.bracket(['cause-effect'], [[x], [y, ['cause-effect']], [z]])]);
    const r = C.createBracket(d, [x.id, y.id]);
    if ('error' in r) throw new Error(r.error);
    d = r.doc;
    const p = preflight(d, computeLayout(d, meas()), true);
    expect(p.blocking).toEqual([]);
    expect(p.soft.map((i) => i.kind).sort()).toEqual(['missingMain', 'pending', 'unassigned']);
    const b2 = new Builder();
    const p1 = b2.row('p'), p2 = b2.row('q'), p3 = b2.row('r');
    const d3 = b2.build([b2.bracket(['cause-effect'], [[p1], [p2, ['cause-effect']], [p3]])]);
    const dm = (C.deleteRows(d3, [p2.id]) as { doc: typeof d }).doc;
    expect(preflight(dm, computeLayout(dm, meas()), true).soft.some((i) => i.kind === 'missingMain')).toBe(true);
  });
  it('版面過窄：縮排太深或對照欄太寬時出現，縮小版面縮放可以解除', () => {
    const doc = sampleJohn3();
    const wide = structuredClone(doc);
    wide.settings.refColumns = [{ id: 'c1', lang: 'en', visible: true, width: 0.45, mode: 'row' }];
    expect(computeLayout(wide, meas()).warnings.narrow).toBe(true);
    const tooBig = structuredClone(wide);
    tooBig.settings.layoutScale = 1.3;
    expect(computeLayout(tooBig, meas()).warnings.narrow).toBe(true);
    const r = C.setSettings(wide, { ...wide.settings, refColumns: [{ ...wide.settings.refColumns[0], visible: false }] });
    if ('error' in r) throw new Error(r.error);
    expect(computeLayout(r.doc, meas()).warnings.narrow).toBe(false);
  });
});

describe('版面設定', () => {
  it('版面縮放改變內容區大小（縮放越大，同一頁放得下越多）', () => {
    const d = sampleJohn3();
    const a = computeLayout(d, meas()).page;
    const d2 = structuredClone(d);
    d2.settings.layoutScale = 2;
    const b = computeLayout(d2, meas()).page;
    expect(b.contentW).toBeCloseTo(a.contentW / 2);
    expect(b.w).toBe(a.w);
  });
  it('橫向時頁面寬高對調', () => {
    const d = sampleJohn3();
    d.settings.page.orientation = 'landscape';
    const p = computeLayout(d, meas()).page;
    expect(p.w).toBe(297);
    expect(p.h).toBe(210);
  });
  it('不合法的設定被拒絕；移除對照欄時各行對應的內容一起移除；一個復原步驟', () => {
    const d = sampleJohn3();
    expect(validateSettings({ ...d.settings, layoutScale: 9 }).length).toBeGreaterThan(0);
    expect('error' in C.setSettings(d, { ...d.settings, main: { ...d.settings.main, size: 2 } })).toBe(true);
    const withCol = C.setSettings(d, { ...d.settings, refColumns: [{ id: 'c1', lang: 'en', visible: true, width: 0.2, mode: 'row' }] });
    if ('error' in withCol) throw new Error();
    expect(validate(withCol.doc)).toEqual([]);
    const removed = C.setSettings(withCol.doc, { ...withCol.doc.settings, refColumns: [] });
    if ('error' in removed) throw new Error();
    expect(validate(removed.doc)).toEqual([]);
  });
});
