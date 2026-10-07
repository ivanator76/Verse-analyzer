import { createDoc } from './doc';
import type { Bracket, Child, Doc, Item, Label, Row, Seg } from './types';

// 建立測試與範例文件用的小工具（不是編輯用的 API）。

export function T(text: string): Seg {
  return { t: 'text', text, marks: [] };
}
export function V(v: number, c = 3, shown = true): Seg {
  return { t: 'verse', c, v, shown };
}

export class Builder {
  doc: Doc = createDoc();
  private n = 0;
  private id(p: string) {
    return `${p}${++this.n}`;
  }

  row(main: string | Seg[], indent = 0, refs: Record<string, string> = {}): Row {
    const segs = typeof main === 'string' ? [T(main)] : main;
    return {
      kind: 'row',
      id: this.id('r'),
      indent,
      pageBreakBefore: false,
      main: segs,
      refs: Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, [T(v)]])),
    };
  }

  /**
   * 括號。types 是關係類型 id 陣列（可多個）；kids 的每一項是 [項目, 主句的關係類型陣列]。
   */
  bracket(types: string[], kids: [Item, string[]?][]): Bracket {
    const rels = types.map((type) => ({ id: this.id('q'), type }));
    const children: Child[] = kids.map(([item, mains = []]) => {
      const labels: Record<string, Label> = {};
      rels.forEach((r) => (labels[r.id] = { text: null, main: mains.includes(r.type), pending: false }));
      return { labels, item };
    });
    return { kind: 'bracket', id: this.id('b'), relations: rels, children };
  }

  build(items: Item[]): Doc {
    this.doc.items = items.map((item) => ({ labels: {}, item }));
    this.doc.counter = 10_000;
    return this.doc;
  }
}
