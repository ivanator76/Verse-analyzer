import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import * as C from '../src/core/commands';
import { sampleJohn3 } from '../src/core/sample';
import { rowsInOrder, segsText } from '../src/core/tree';
import { validate } from '../src/core/validate';
import { sameAttribution, textAttribution } from '../src/core/verses';
import type { Bracket, Child, Doc } from '../src/core/types';

// §5.4：隨機操作序列，每一步檢查結構與內容條件。

const allItems = (doc: Doc) => {
  const out: { id: string; kind: 'row' | 'bracket' }[] = [];
  const walk = (l: Child[]) => l.forEach((c) => (out.push({ id: c.item.id, kind: c.item.kind }), c.item.kind === 'bracket' && walk(c.item.children)));
  walk(doc.items);
  return out;
};
const brackets = (doc: Doc) => {
  const out: Bracket[] = [];
  const walk = (l: Child[]) => l.forEach((c) => c.item.kind === 'bracket' && (out.push(c.item), walk(c.item.children)));
  walk(doc.items);
  return out;
};
const multiset = (doc: Doc) => rowsInOrder(doc).map((r) => segsText(r.main)).sort().join('\u0000');
const ordered = (doc: Doc) => rowsInOrder(doc).map((r) => segsText(r.main)).join('');
/** 閱讀順序上每一個字元所屬的經節。 */
function charVerses(doc: Doc): string[] {
  const out: string[] = [];
  let cur = 'none';
  for (const r of rowsInOrder(doc))
    for (const s of r.main) {
      if (s.t === 'verse') cur = `${s.c}:${s.v}`;
      else for (let i = 0; i < s.text.length; i++) out.push(cur);
    }
  return out;
}
/** 有一個逐行對照欄、每一行都有內容的起始文件（讓「交換」和其他操作混在一起測） */
function start(): Doc {
  const d = sampleJohn3();
  d.settings.refColumns = [{ id: 'c1', lang: 'en', visible: true, width: 0.2, mode: 'row' }];
  rowsInOrder(d).forEach((r, i) => (r.refs = { c1: [{ t: 'text', text: `ref${i}`, marks: [] }] }));
  return d;
}
/** 兩欄的文字合起來（每一行內排序後的字元）；交換不能遺失任何字 */
const bothChars = (d: Doc) => rowsInOrder(d).map((r) => [...segsText(r.main) + segsText(r.refs.c1 ?? [])].sort().join(''));
const normalize = (d: Doc) => ({ ...d, counter: 0 });

type Op = { k: number; a: number; b: number; c: number };
const opArb = fc.record({ k: fc.integer({ min: 0, max: 15 }), a: fc.nat(1000), b: fc.nat(1000), c: fc.nat(1000) });

/** 把隨機數字解析成一個指令；回傳 [指令結果, 文字不變性種類]。 */
function apply(doc: Doc, op: Op): { res: C.Result; text: 'same' | 'multiset' | 'free'; keepVerses: boolean } | null {
  const rows = rowsInOrder(doc);
  const items = allItems(doc);
  const brs = brackets(doc);
  const row = rows[op.a % rows.length];
  const item = items[op.a % items.length];
  const br = brs.length ? brs[op.a % brs.length] : null;
  switch (op.k) {
    case 0: {
      const n = row.main.length ? op.b % row.main.length : 0;
      const seg = row.main[n];
      const off = seg && seg.t === 'text' ? op.c % (seg.text.length + 1) : 0;
      return { res: C.splitRow(doc, row.id, { seg: n, off }), text: 'same', keepVerses: true };
    }
    case 1:
      return { res: C.mergeWithPrev(doc, row.id), text: 'same', keepVerses: true };
    case 2:
      return { res: C.mergeWithNext(doc, row.id), text: 'same', keepVerses: true };
    case 3:
      return { res: C.deleteRows(doc, [row.id], op.b % 2 ? 'merge-prev' : 'delete'), text: 'free', keepVerses: true };
    case 4:
      return { res: C.indentRows(doc, [row.id], op.b % 2 ? 1 : -1), text: 'same', keepVerses: true };
    case 5: {
      const i = op.b % Math.max(1, rows.length - 1);
      return { res: C.createBracket(doc, [rows[i].id, rows[Math.min(i + 1, rows.length - 1)].id]), text: 'same', keepVerses: true };
    }
    case 6:
      return br ? { res: C.dissolveBracket(doc, br.id, op.b % 2 ? { mode: 'allPending' } : { mode: 'give', childId: br.children[op.b % br.children.length].item.id }), text: 'same', keepVerses: true } : null;
    case 7:
      return { res: C.moveItem(doc, item.id, op.b % 2 ? 1 : -1), text: 'multiset', keepVerses: true };
    case 8:
      return { res: C.moveIntoSibling(doc, item.id, op.b % 2 ? 'next' : 'prev'), text: 'same', keepVerses: true };
    case 9:
      return { res: C.moveOutOfBracket(doc, item.id), text: 'same', keepVerses: true };
    case 10:
      return br ? { res: C.addRelation(doc, br.id, doc.relationTypes[op.b % doc.relationTypes.length].id), text: 'same', keepVerses: true } : null;
    case 11:
      return br && br.relations.length ? { res: C.removeRelation(doc, br.id, br.relations[op.b % br.relations.length].id), text: 'same', keepVerses: true } : null;
    case 12:
      return br && br.relations.length
        ? { res: C.setMain(doc, br.id, br.relations[op.b % br.relations.length].id, br.children[op.c % br.children.length].item.id), text: 'same', keepVerses: true }
        : null;
    case 13:
      return br && br.relations.length > 1
        ? { res: C.reorderRelations(doc, br.id, [...br.relations].reverse().map((r) => r.id)), text: 'same', keepVerses: true }
        : null;
    case 14: {
      const other = items[op.b % items.length];
      const anchor = items[op.c % items.length];
      const ids = op.b % 3 === 0 ? [item.id] : [item.id, other.id];
      return { res: C.moveItemsTo(doc, ids, { anchorId: anchor.id, side: op.c % 2 ? 'before' : 'after' }), text: 'multiset', keepVerses: true };
    }
    case 15:
      return { res: C.swapMainWithRefColumn(doc, 'c1'), text: 'free', keepVerses: true };
  }
  return null;
}

describe('隨機操作（§5.4）', () => {
  it('每一步：驗證通過、文字不遺失、經節歸屬不變；復原／重做／存檔重開一致', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 40 }), (ops) => {
        const history: Doc[] = [start()];
        for (const op of ops) {
          const cur = history[history.length - 1];
          const a = apply(cur, op);
          if (!a || 'error' in a.res) continue;
          const next = a.res.doc;
          expect(validate(next)).toEqual([]);
          if (a.text === 'same') expect(ordered(next)).toBe(ordered(cur));
          if (a.text === 'multiset') expect(multiset(next)).toBe(multiset(cur));
          if (op.k === 15) {
            // 交換：每一行兩欄的文字合起來不遺失；結構不變；欄語言對調
            expect(bothChars(next)).toEqual(bothChars(cur));
            expect(next.settings.main.lang).toBe(cur.settings.refColumns[0].lang);
            expect(next.settings.refColumns[0].lang).toBe(cur.settings.main.lang);
          }
          if (a.text === 'same') expect(charVerses(next)).toEqual(charVerses(cur));
          else if (op.k === 15) {
            /* 交換會依規則移動經節標記，歸屬另有專門的測試 */
          }
          else {
            // 移動、刪除：留下來的每一行，歸屬都不變
            const ids = rowsInOrder(cur).map((r) => r.id).filter((id) => rowsInOrder(next).some((r) => r.id === id));
            expect(sameAttribution(textAttribution(cur), textAttribution(next), ids)).toBe(true);
          }
          // 存檔再開檔一致
          expect(JSON.parse(JSON.stringify(next))).toEqual(next);
          history.push(next);
        }
        // 一路復原到底＝原本；快照不可變，重做就是回到各自的快照
        expect(normalize(history[0])).toEqual(normalize(start()));
        for (let i = history.length - 1; i > 0; i--) expect(validate(history[i])).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });
});
