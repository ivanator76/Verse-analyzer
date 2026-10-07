import { Schema, type Node as PmNode } from 'prosemirror-model';
import type { Seg, TextMark, TextSeg } from '../core/types';
import { normalizeSegs } from '../core/tree';

// ProseMirror 只當作「單一格子的文字編輯器」（PLAN §2、§3）。

export const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph' },
    paragraph: { content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    verse: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { c: { default: 1 }, v: { default: 1 }, shown: { default: true } },
      toDOM: (n) => [
        'sup',
        { class: `verse${n.attrs.shown ? '' : ' hid'}`, title: n.attrs.shown ? '' : `隱藏的經節錨點（${n.attrs.c}:${n.attrs.v}），保存經節歸屬，不列印` },
        String(n.attrs.v),
      ],
    },
  },
  marks: {
    b: { toDOM: () => ['b', 0] },
    i: { toDOM: () => ['i', 0] },
    u: { toDOM: () => ['u', 0] },
    sup: { toDOM: () => ['sup', 0] },
    hl: { attrs: { color: {} }, toDOM: (m) => ['span', { style: `background:${m.attrs.color}` }, 0] },
    color: { attrs: { color: {} }, toDOM: (m) => ['span', { style: `color:${m.attrs.color}` }, 0] },
  },
});

const MARK_ORDER = ['b', 'i', 'u', 'sup', 'hl', 'color'];

export function segsToPm(segs: Seg[]): PmNode {
  const inline: PmNode[] = [];
  for (const s of segs) {
    if (s.t === 'verse') inline.push(schema.nodes.verse.create({ c: s.c, v: s.v, shown: s.shown }));
    else if (s.text !== '')
      inline.push(
        schema.text(
          s.text,
          s.marks.map((m) => schema.marks[m.k].create('color' in m ? { color: m.color } : undefined)),
        ),
      );
  }
  return schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, inline));
}

export function pmToSegs(doc: PmNode): Seg[] {
  const out: Seg[] = [];
  doc.firstChild!.forEach((n) => {
    if (n.type.name === 'verse') out.push({ t: 'verse', c: n.attrs.c, v: n.attrs.v, shown: n.attrs.shown });
    else if (n.isText) {
      const marks = n.marks
        .map((m): TextMark => (m.type.name === 'hl' || m.type.name === 'color' ? ({ k: m.type.name, color: m.attrs.color } as TextMark) : ({ k: m.type.name } as TextMark)))
        .sort((a, b) => MARK_ORDER.indexOf(a.k) - MARK_ORDER.indexOf(b.k));
      out.push({ t: 'text', text: n.text!, marks } as TextSeg);
    }
  });
  return normalizeSegs(out);
}

/** ProseMirror 內容內的大小：文字算字元數、經節標記算 1。 */
export function segsSize(segs: Seg[]): number {
  return segs.reduce((a, s) => a + (s.t === 'verse' ? 1 : s.text.length), 0);
}

/** 內容位移 → 指令層的 Pos（§4.3）。 */
export function offsetToPos(segs: Seg[], offset: number): { seg: number; off: number } {
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.t === 'verse') {
      if (offset <= acc) return { seg: i, off: 0 };
      acc += 1;
    } else {
      if (offset <= acc + s.text.length) return { seg: i, off: offset - acc };
      acc += s.text.length;
    }
  }
  return { seg: segs.length, off: 0 };
}
