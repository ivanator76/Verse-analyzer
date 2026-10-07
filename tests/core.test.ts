import { describe, expect, it } from 'vitest';
import { Builder, T, V } from '../src/core/builder';
import * as C from '../src/core/commands';
import { mainText, rowsInOrder } from '../src/core/tree';
import { validate } from '../src/core/validate';
import { sampleJohn3 } from '../src/core/sample';
import { sameAttribution, textAttribution } from '../src/core/verses';
import type { Doc } from '../src/core/types';

const ok = (r: C.Result): Doc => {
  if ('error' in r) throw new Error(r.error);
  expect(validate(r.doc)).toEqual([]);
  return r.doc;
};
const strip = (d: Doc) => ({ ...d, counter: 0 });

describe('sample', () => {
  it('通過驗證', () => expect(validate(sampleJohn3())).toEqual([]));
});

describe('拆行與合併（§4.3）', () => {
  it('拆行後馬上合併＝原樣（包含空白、括號、標記）', () => {
    const b = new Builder();
    const r1 = b.row([V(16), T('γὰρ  ὁ θεὸς ')], 1);
    const r2 = b.row('οὕτως');
    const br = b.bracket(['cause-effect'], [[r1], [r2, ['cause-effect']]]);
    const doc = b.build([br]);
    const split = ok(C.splitRow(doc, r1.id, { seg: 1, off: 4 }));
    expect(rowsInOrder(split).length).toBe(3);
    expect(mainText(split)).toBe(mainText(doc));
    const rows = rowsInOrder(split);
    const merged = ok(C.mergeWithPrev(split, rows[1].id));
    expect(strip(merged)).toEqual(strip(doc));
  });

  it('情況二：父括號已有關係時，拆行建立「未指定關係」括號並接手標記', () => {
    const b = new Builder();
    const r1 = b.row('甲乙');
    const r2 = b.row('丙');
    const doc = b.build([b.bracket(['cause-effect'], [[r1], [r2, ['cause-effect']]])]);
    const out = ok(C.splitRow(doc, r1.id, { seg: 0, off: 1 }));
    const top = out.items[0].item;
    if (top.kind !== 'bracket') throw new Error();
    const s = top.children[0].item;
    expect(s.kind).toBe('bracket');
    expect(top.children[0].labels[top.relations[0].id].main).toBe(false);
    expect(C.findIncomplete(out).unassignedBrackets).toEqual([s.id]);
  });

  it('跨括號合併會提示移除的關係數', () => {
    const b = new Builder();
    const a = b.row('a');
    const c = b.row('c');
    const d2 = b.row('d');
    const doc = b.build([b.bracket(['and'], [[a], [b.bracket(['or'], [[c], [d2]])]])]);
    const r = C.mergeWithPrev(doc, c.id);
    if ('error' in r) throw new Error(r.error);
    expect(validate(r.doc)).toEqual([]);
    expect(r.notices[0]).toContain('移除了 1 個括號關係');
  });

  it('貼上多行：只建立一個未指定關係括號，游標後的文字接在最後一行', () => {
    const b = new Builder();
    const r1 = b.row('前後');
    const doc = b.build([b.bracket(['and'], [[r1], [b.row('x')]])]);
    const out = ok(C.pasteLines(doc, r1.id, { seg: 0, off: 1 }, ['A', 'B', 'C']));
    expect(rowsInOrder(out).map((r) => r.main.map((s) => (s.t === 'text' ? s.text : '')).join(''))).toEqual([
      '前A',
      'B',
      'C後',
      'x',
    ]);
    expect(C.findIncomplete(out).unassignedBrackets.length).toBe(1);
  });
});

describe('括號整理（§4.2）與括號操作（§4.4）', () => {
  it('刪到剩 1 個子項：解除括號，子項繼承括號的分支標記', () => {
    const b = new Builder();
    const x = b.row('x');
    const y = b.row('y');
    const z = b.row('z');
    const inner = b.bracket(['and'], [[x], [y]]);
    const doc = b.build([b.bracket(['cause-effect'], [[inner], [z, ['cause-effect']]])]);
    const out = ok(C.deleteRows(doc, [y.id]));
    const top = out.items[0].item;
    if (top.kind !== 'bracket') throw new Error();
    expect(top.children[0].item.id).toBe(x.id);
    expect(top.children[1].labels[top.relations[0].id].main).toBe(true);
  });

  it('建立括號：被包住的非空標記要提示，新括號在父括號裡是待判定', () => {
    const b = new Builder();
    const p = b.row('p'), q = b.row('q'), s = b.row('s');
    const doc = b.build([b.bracket(['cause-effect'], [[p], [q], [s, ['cause-effect']]])]);
    const r = C.createBracket(doc, [p.id, q.id]);
    if ('error' in r) throw new Error(r.error);
    expect(validate(r.doc)).toEqual([]);
    expect(r.notices[0]).toContain('已移除 2 個標記');
    expect(C.findIncomplete(r.doc).pendingLabels.length).toBe(1);
    expect('error' in C.createBracket(doc, [p.id, q.id, s.id])).toBe(true);
  });

  it('解除有標記的括號必須選擇去向', () => {
    const b = new Builder();
    const x = b.row('x'), y = b.row('y'), z = b.row('z');
    const inner = b.bracket(['and'], [[x], [y]]);
    const doc = b.build([b.bracket(['cause-effect'], [[inner, ['cause-effect']], [z]])]);
    expect('error' in C.dissolveBracket(doc, inner.id)).toBe(true);
    const out = ok(C.dissolveBracket(doc, inner.id, { mode: 'give', childId: y.id }));
    const top = out.items[0].item;
    if (top.kind !== 'bracket') throw new Error();
    const rid = top.relations[0].id;
    expect(top.children.map((c) => c.labels[rid].pending)).toEqual([true, false, false]);
    expect(top.children[1].labels[rid].main).toBe(true);
  });

  it('併入相鄰括號／移出括號', () => {
    const b = new Builder();
    const x = b.row('x'), y = b.row('y'), z = b.row('z');
    const inner = b.bracket(['and'], [[y], [z]]);
    const doc = b.build([b.bracket(['or'], [[x], [inner]]), b.row('w')]);
    const into = ok(C.moveIntoSibling(doc, x.id, 'next'));
    expect(mainText(into)).toBe(mainText(doc));
    const out = ok(C.moveOutOfBracket(into, x.id));
    expect(mainText(out)).toBe(mainText(doc));
  });
});

describe('關係與標記（§4.5）', () => {
  it('加入、替換、移除、排序、交換主次；自訂文字不隨主次改變', () => {
    const b = new Builder();
    const x = b.row('x'), y = b.row('y');
    const br = b.bracket(['and'], [[x], [y]]);
    let d = b.build([br]);
    d = ok(C.addRelation(d, br.id, 'cause-effect'));
    d = ok(C.addRelation(d, br.id, 'progress'));
    let bb = d.items[0].item as typeof br;
    const [and, ce, pg] = bb.relations;
    expect(bb.children[1].labels[ce.id].main).toBe(true);
    d = ok(C.setLabelText(d, br.id, ce.id, x.id, '因為'));
    d = ok(C.swapMain(d, br.id, ce.id));
    bb = d.items[0].item as typeof br;
    expect(bb.children[0].labels[ce.id]).toEqual({ text: '因為', main: true, pending: false });
    d = ok(C.reorderRelations(d, br.id, [pg.id, ce.id, and.id]));
    d = ok(C.replaceRelation(d, br.id, ce.id, 'or'));
    bb = d.items[0].item as typeof br;
    expect(bb.children.every((c) => !c.labels[ce.id].main)).toBe(true);
    d = ok(C.removeRelation(d, br.id, pg.id));
    expect(Object.keys((d.items[0].item as typeof br).children[0].labels).length).toBe(2);
  });

  it('缺主句是算出來的', () => {
    const b = new Builder();
    const x = b.row('x'), y = b.row('y'), z = b.row('z');
    const br = b.bracket(['cause-effect'], [[x], [y, ['cause-effect']], [z]]);
    const d = b.build([br]);
    expect(C.findIncomplete(d).missingMain).toEqual([]);
    const out = ok(C.deleteRows(d, [y.id]));
    expect(C.findIncomplete(out).missingMain.length).toBe(1);
  });
});

describe('經節歸屬（§7）', () => {
  it('移動後每一段文字的經節歸屬不變，並補上隱藏錨點', () => {
    const b = new Builder();
    const a = b.row([V(16), T('A')]);
    const bRow = b.row('B');
    const c = b.row([V(17), T('C')]);
    const d0 = b.build([a, bRow, c]);
    const out = ok(C.moveItem(d0, bRow.id, 1));
    expect(rowsInOrder(out).map((r) => r.id)).toEqual([a.id, c.id, bRow.id]);
    expect(sameAttribution(textAttribution(d0), textAttribution(out), [a.id, bRow.id, c.id])).toBe(true);
    const moved = rowsInOrder(out)[2];
    expect(moved.main[0]).toEqual({ t: 'verse', c: 3, v: 16, shown: false });
  });

  it('沒有必要的錨點會被整理掉（移回去）', () => {
    const b = new Builder();
    const a = b.row([V(16), T('A')]);
    const bRow = b.row('B');
    const c = b.row([V(17), T('C')]);
    const d0 = b.build([a, bRow, c]);
    const moved = ok(C.moveItem(d0, bRow.id, 1));
    const back = ok(C.moveItem(moved, bRow.id, -1));
    expect(strip(back)).toEqual(strip(d0));
  });
});
