import type { Bracket, Child, Doc, Item, Row, Seg, TextSeg } from './types';

export function rowsInOrder(doc: Doc): Row[] {
  const out: Row[] = [];
  const walk = (list: Child[]) => {
    for (const c of list) {
      if (c.item.kind === 'row') out.push(c.item);
      else walk(c.item.children);
    }
  };
  walk(doc.items);
  return out;
}

export interface Loc {
  parent: Bracket | null;
  list: Child[];
  index: number;
}

export function locate(doc: Doc, id: string): Loc | null {
  const find = (list: Child[], parent: Bracket | null): Loc | null => {
    for (let i = 0; i < list.length; i++) {
      const it = list[i].item;
      if (it.id === id) return { parent, list, index: i };
      if (it.kind === 'bracket') {
        const r = find(it.children, it);
        if (r) return r;
      }
    }
    return null;
  };
  return find(doc.items, null);
}

export function findItem(doc: Doc, id: string): Item | null {
  const l = locate(doc, id);
  return l ? l.list[l.index].item : null;
}

/** 括號往下最多有幾層括號（葉括號＝1）。 */
export function bracketHeight(b: Bracket): number {
  let h = 0;
  for (const c of b.children) if (c.item.kind === 'bracket') h = Math.max(h, bracketHeight(c.item));
  return h + 1;
}

export function firstRow(item: Item): Row {
  return item.kind === 'row' ? item : firstRow(item.children[0].item);
}

export function lastRow(item: Item): Row {
  return item.kind === 'row' ? item : lastRow(item.children[item.children.length - 1].item);
}

export function segsText(segs: Seg[]): string {
  return segs.map((s) => (s.t === 'text' ? s.text : '')).join('');
}

/** 分析欄全部文字依閱讀順序串起來（隨機測試用）。 */
export function mainText(doc: Doc): string {
  return rowsInOrder(doc)
    .map((r) => segsText(r.main))
    .join('');
}

const sameMarks = (a: TextSeg, b: TextSeg) => JSON.stringify(a.marks) === JSON.stringify(b.marks);

/** 去掉空文字片段、合併相鄰且標記相同的文字片段。 */
export function normalizeSegs(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    if (s.t === 'text') {
      if (s.text === '') continue;
      const last = out[out.length - 1];
      if (last && last.t === 'text' && sameMarks(last, s)) {
        out[out.length - 1] = { ...last, text: last.text + s.text };
        continue;
      }
    }
    out.push(s);
  }
  return out;
}
