import { describe, expect, it } from 'vitest';
import { Builder, T, V } from '../src/core/builder';
import * as C from '../src/core/commands';
import { mainText, rowsInOrder, segsText } from '../src/core/tree';
import { validate } from '../src/core/validate';
import { sameAttribution, textAttribution } from '../src/core/verses';
import type { Doc } from '../src/core/types';

const ok = (r: C.Result): Doc => {
  if ('error' in r) throw new Error(r.error);
  expect(validate(r.doc)).toEqual([]);
  return r.doc;
};
const order = (d: Doc) => rowsInOrder(d).map((r) => segsText(r.main));

function make() {
  const b = new Builder();
  const a = b.row('a'), bb = b.row('b'), c = b.row('c'), d = b.row('d'), e = b.row('e');
  const inner = b.bracket(['and'], [[bb], [c]]);
  const outer = b.bracket(['cause-effect'], [[a], [inner, ['cause-effect']]]);
  const doc = b.build([outer, d, e]);
  return { doc, a, b: bb, c, d, e, inner, outer };
}

describe('拖曳移動（moveItemsTo）', () => {
  it('同一層重新排序：標記跟著項目走', () => {
    const { doc, a, inner, outer } = make();
    const out = ok(C.moveItemsTo(doc, [inner.id], { anchorId: a.id, side: 'before' }));
    const o = out.items[0].item;
    if (o.kind !== 'bracket') throw new Error();
    expect(o.children[0].item.id).toBe(inner.id);
    expect(o.children[0].labels[o.relations[0].id].main).toBe(true); // 主句標記還在 inner 身上
    expect(order(out)).toEqual(['b', 'c', 'a', 'd', 'e']);
    void outer;
  });

  it('搬進括號：成為兄弟，標記捨棄並提示，新位置是待判定', () => {
    const { doc, d, c } = make();
    const r = C.moveItemsTo(doc, [d.id], { anchorId: c.id, side: 'after' }); // d 放到 inner 裡 c 的後面
    if ('error' in r) throw new Error(r.error);
    expect(validate(r.doc)).toEqual([]);
    expect(order(r.doc)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(C.findIncomplete(r.doc).pendingLabels.length).toBe(1); // d 在 inner（以及）裡的標記是待判定
  });

  it('搬出括號：括號剩一個子項會自動解除，剩下的子項繼承標記', () => {
    const { doc, b, d } = make();
    const out = ok(C.moveItemsTo(doc, [b.id], { anchorId: d.id, side: 'after' }));
    expect(order(out)).toEqual(['a', 'c', 'd', 'b', 'e']);
    const o = out.items[0].item;
    if (o.kind !== 'bracket') throw new Error();
    expect(o.children[1].item.kind).toBe('row'); // inner 解除，c 接手
    expect(o.children[1].labels[o.relations[0].id].main).toBe(true); // 繼承 inner 的主句標記
  });

  it('一次移動多個項目，保持原本的順序', () => {
    const { doc, a, d, e } = make();
    const out = ok(C.moveItemsTo(doc, [e.id, d.id], { anchorId: a.id, side: 'before' }));
    expect(order(out)).toEqual(['d', 'e', 'a', 'b', 'c']);
  });

  it('括號和它裡面的行同時選取：只移動括號', () => {
    const { doc, b, inner, e } = make();
    const out = ok(C.moveItemsTo(doc, [b.id, inner.id], { anchorId: e.id, side: 'after' }));
    expect(order(out)).toEqual(['a', 'd', 'e', 'b', 'c']);
  });

  it('不能移到自己裡面；沒有改變的位置會被拒絕', () => {
    const { doc, inner, b, a, d } = make();
    expect('error' in C.moveItemsTo(doc, [inner.id], { anchorId: b.id, side: 'before' })).toBe(true);
    expect('error' in C.moveItemsTo(doc, [d.id], { anchorId: a.id, side: 'after' })).toBe(false); // d 搬進 outer：有改變
    expect('error' in C.moveItemsTo(doc, ['nope'], { anchorId: a.id, side: 'before' })).toBe(true);
  });

  it('移到原來的位置：沒有改變', () => {
    const { doc, d, e } = make();
    const r = C.moveItemsTo(doc, [d.id], { anchorId: e.id, side: 'before' });
    expect('error' in r && r.error).toBe('位置沒有改變');
  });

  it('經節歸屬不變：移動後每一行的經節都一樣（補隱藏錨點）', () => {
    const b = new Builder();
    const r1 = b.row([V(16), T('A')]);
    const r2 = b.row('B');
    const r3 = b.row([V(17), T('C')]);
    const r4 = b.row('D');
    const doc = b.build([r1, r2, r3, r4]);
    const out = ok(C.moveItemsTo(doc, [r2.id], { anchorId: r4.id, side: 'after' }));
    expect(order(out)).toEqual(['A', 'C', 'D', 'B']);
    expect(sameAttribution(textAttribution(doc), textAttribution(out), [r1.id, r2.id, r3.id, r4.id])).toBe(true);
    expect(rowsInOrder(out)[3].main[0]).toEqual({ t: 'verse', c: 3, v: 16, shown: false });
  });

  it('文字不遺失', () => {
    const { doc, c, a } = make();
    const out = ok(C.moveItemsTo(doc, [c.id], { anchorId: a.id, side: 'before' }));
    expect([...mainText(out)].sort().join('')).toBe([...mainText(doc)].sort().join(''));
  });
});

describe('拖曳：邊界情況（隨機測試找到的）', () => {
  it('同一個 id 重複傳入時只移動一次，不會複製項目', () => {
    const { doc, d, a } = make();
    const out = ok(C.moveItemsTo(doc, [d.id, d.id], { anchorId: a.id, side: 'before' }));
    expect(order(out).filter((t) => t === 'd').length).toBe(1);
  });
});

import { dropLevels } from '../src/core/drop';

describe('拖曳：可放的位置（由內往外）', () => {
  it('放在括號的第一個子項前面：可以放進括號，也可以放在括號外面前面', () => {
    const { doc, a, outer } = make();
    // outer 的第一個子項是 a，outer 又是最上層的第一個
    expect(dropLevels(doc, a.id, 'before', [make().d.id]).map((l) => l.anchorId)).toEqual([a.id, outer.id]);
  });
  it('只有邊緣的行才能選外層：中間的行只有自己這一層', () => {
    const { doc, b, c, inner, outer } = make();
    // inner = [b, c]：b 在最前面、c 在最後面
    expect(dropLevels(doc, b.id, 'after', []).map((l) => l.anchorId)).toEqual([b.id]); // b 不是最後一個
    expect(dropLevels(doc, c.id, 'after', []).map((l) => l.anchorId)).toEqual([c.id, inner.id, outer.id]); // inner 是 outer 的最後一個、outer 是括號群的最外層 → 一路往外
  });
  it('指標在被拖的項目自己上面時沒有位置；不會列出被拖的括號本身', () => {
    const { doc, b, c, inner } = make();
    expect(dropLevels(doc, b.id, 'before', [inner.id])).toEqual([]);
    expect(dropLevels(doc, c.id, 'after', [c.id])).toEqual([]);
  });
});
