import { describe, expect, it } from 'vitest';
import { Builder, T, V } from '../src/core/builder';
import * as C from '../src/core/commands';
import { rowsInOrder, segsText } from '../src/core/tree';
import { validate } from '../src/core/validate';
import { startVerses, textAttribution } from '../src/core/verses';
import { fontStackForLang } from '../src/core/fonts';
import type { Doc, Seg } from '../src/core/types';

const ok = (r: C.Result): Doc => {
  if ('error' in r) throw new Error(r.error);
  expect(validate(r.doc)).toEqual([]);
  return r.doc;
};

/** 中文分析欄 + 希臘文逐行對照欄 c1 */
function make() {
  const b = new Builder();
  const r1 = b.row([V(14), T('摩西在曠野舉蛇')]);
  const r2 = b.row('人子也必被舉起', 2);
  const r3 = b.row([V(15), T('叫信的人得永生')]);
  const r4 = b.row('而且不至滅亡');
  const br = b.bracket(['cause-effect'], [[r1], [r2, ['cause-effect']]]);
  const doc = b.build([br, r3, r4]);
  doc.settings.main.lang = 'zh-Hant';
  doc.settings.refColumns = [{ id: 'c1', lang: 'grc', visible: true, width: 0.3, mode: 'row' }];
  const grc = ['Καὶ καθὼς Μωϋσῆς', 'οὕτως ὑψωθῆναι', 'ἵνα πᾶς ὁ πιστεύων', 'ἔχῃ ζωὴν'];
  [r1, r2, r3, r4].forEach((r, i) => (r.refs = { c1: [T(grc[i])] }));
  return { doc, rows: [r1, r2, r3, r4], grc };
}

const mainTexts = (d: Doc) => rowsInOrder(d).map((r) => segsText(r.main));
const refTexts = (d: Doc) => rowsInOrder(d).map((r) => segsText(r.refs.c1 ?? []));
/** 括號、關係、標記、縮排、分頁點：交換時完全不能變 */
const structure = (d: Doc) =>
  JSON.stringify(
    JSON.parse(JSON.stringify(d.items), (k, v) => (k === 'main' || k === 'refs' ? undefined : v)),
  );

describe('交換分析欄與對照欄（§8.1）', () => {
  it('每一行的文字和欄語言對調；括號、關係、縮排完全不變', () => {
    const { doc, grc } = make();
    const out = ok(C.swapMainWithRefColumn(doc, 'c1'));
    expect(mainTexts(out)).toEqual(grc);
    expect(refTexts(out)).toEqual(['摩西在曠野舉蛇', '人子也必被舉起', '叫信的人得永生', '而且不至滅亡']);
    expect(out.settings.main.lang).toBe('grc');
    expect(out.settings.refColumns[0].lang).toBe('zh-Hant');
    expect(structure(out)).toBe(structure(doc));
    expect(rowsInOrder(out)[1].indent).toBe(2);
  });

  it('交換兩次：文字、格式、語言都回到原樣', () => {
    const { doc } = make();
    const twice = ok(C.swapMainWithRefColumn(ok(C.swapMainWithRefColumn(doc, 'c1')), 'c1'));
    expect(twice).toEqual({ ...doc, counter: twice.counter });
  });

  it('文字標記（粗體等）跟著文字一起移動', () => {
    const { doc, rows } = make();
    const bold: Seg = { t: 'text', text: 'ἔχῃ', marks: [{ k: 'b' }] };
    const d2 = ok(C.setRefCells(doc, 'c1', [{ rowId: rows[3].id, segs: [bold] }]));
    const out = ok(C.swapMainWithRefColumn(d2, 'c1'));
    expect(rowsInOrder(out)[3].main).toEqual([bold]);
  });

  it('經節標記集中到新分析欄的行首：沒有行中標記時，每一行的經節歸屬完全不變', () => {
    const { doc } = make();
    const before = startVerses(doc);
    const out = ok(C.swapMainWithRefColumn(doc, 'c1'));
    const after = startVerses(out);
    for (const r of rowsInOrder(doc)) expect(after.get(r.id)).toEqual(before.get(r.id));
    expect(rowsInOrder(out)[0].main[0]).toEqual({ t: 'verse', c: 3, v: 14, shown: true });
    const ids = rowsInOrder(doc).map((r) => r.id);
    // 每一行第一段文字所屬的經節不變
    const a1 = textAttribution(doc);
    const a2 = textAttribution(out);
    for (const id of ids) expect(a2.get(id)![0]).toEqual(a1.get(id)![0]);
  });

  it('行中的經節標記：列出來並集中到行首，標記的總數與順序不變', () => {
    const b = new Builder();
    const a = b.row([V(16), T('甲'), V(17), T('乙')]);
    const c = b.row('丙');
    const doc = b.build([a, c]);
    doc.settings.refColumns = [{ id: 'c1', lang: 'grc', visible: true, width: 0.3, mode: 'row' }];
    a.refs = { c1: [T('alpha beta')] };
    c.refs = { c1: [T('gamma')] };
    const plan = C.planSwap(doc, 'c1');
    expect(plan.midMarkerRows).toEqual([a.id]);
    const r = C.swapMainWithRefColumn(doc, 'c1');
    if ('error' in r) throw new Error(r.error);
    expect(r.notices[0]).toContain('1 行含行中的經節標記');
    const first = rowsInOrder(r.doc)[0];
    expect(first.main.map((s) => (s.t === 'verse' ? `${s.c}:${s.v}` : segsText([s])))).toEqual(['3:16', '3:17', 'alpha beta']);
    expect(segsText(first.refs.c1)).toBe('甲乙');
  });

  it('對照欄空白的行：新分析欄是空行（括號結構照留），並提示行數', () => {
    const { doc, rows } = make();
    const d2 = ok(C.setRefCells(doc, 'c1', [{ rowId: rows[3].id, segs: [] }]));
    const r = C.swapMainWithRefColumn(d2, 'c1');
    if ('error' in r) throw new Error(r.error);
    expect(r.notices.join('|')).toContain('1 行的新分析欄文字是空白');
    expect(segsText(rowsInOrder(r.doc)[3].main)).toBe('');
    expect(structure(r.doc)).toBe(structure(d2));
  });

  it('對照欄完全沒有內容、整節對照欄、不存在的欄：拒絕交換', () => {
    const { doc } = make();
    const empty = structuredClone(doc);
    rowsInOrder(empty).forEach((r) => (r.refs.c1 = []));
    expect(C.planSwap(empty, 'c1').error).toContain('還沒有任何內容');
    const verse = structuredClone(doc);
    verse.settings.refColumns[0].mode = 'verse';
    expect(C.planSwap(verse, 'c1').error).toContain('整節對照欄');
    expect('error' in C.swapMainWithRefColumn(verse, 'c1')).toBe(true);
    expect('error' in C.swapMainWithRefColumn(doc, 'nope')).toBe(true);
  });

  it('交換後拆行、合併仍然符合規則：原分析欄文字現在是對照欄，拆行時留在上半行', () => {
    const { doc } = make();
    const out = ok(C.swapMainWithRefColumn(doc, 'c1'));
    const rows = rowsInOrder(out);
    const sp = ok(C.splitRow(out, rows[0].id, { seg: 1, off: 3 }));
    const r = rowsInOrder(sp);
    expect(segsText(r[0].main) + segsText(r[1].main)).toBe(segsText(rows[0].main));
    expect(segsText(r[0].refs.c1)).toBe('摩西在曠野舉蛇');
    expect(segsText(r[1].refs.c1 ?? [])).toBe('');
  });
});

describe('語言 → 字型', () => {
  it('希臘文、英文用 Gentium Plus；中文用繁體宋體，缺字退回 Gentium Plus', () => {
    expect(fontStackForLang('grc')).toContain('"Gentium Plus"');
    expect(fontStackForLang('grc').startsWith('"Gentium Plus"')).toBe(true);
    expect(fontStackForLang('en').startsWith('"Gentium Plus"')).toBe(true);
    expect(fontStackForLang('zh-Hant').startsWith('"Songti TC"')).toBe(true);
    expect(fontStackForLang('zh-Hant')).toContain('"Gentium Plus"');
  });
});
