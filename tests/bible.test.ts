import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { BOOKS, VERSIONS, availableLangs, buildDocFromBible, chineseNumber, formatRange, rangeRefs, validateLayout, validateRange, versificationWarnings, type BibleData, type LangId } from '../src/core/bible';
import { defaultSettings } from '../src/core/doc';
import { DEFAULT_RELATION_TYPES } from '../src/core/relations';
import { rowsInOrder, segsText } from '../src/core/tree';
import { validate } from '../src/core/validate';
import { startVerses } from '../src/core/verses';
import { verseBlocks } from '../src/core/verseblocks';

const dir = path.join(__dirname, '..', 'src/data/bible');
const cuv = JSON.parse(readFileSync(path.join(dir, 'cuv.json'), 'utf8')) as BibleData;
const bsb = JSON.parse(readFileSync(path.join(dir, 'bsb.json'), 'utf8')) as BibleData;
const sbl = JSON.parse(readFileSync(path.join(dir, 'sblgnt.json'), 'utf8')) as BibleData;
const versions = { 'zh-Hant': cuv, en: bsb, grc: sbl };

const build = (range: Parameters<typeof buildDocFromBible>[0]['range'], useShen = false, main: LangId = 'zh-Hant', refs: LangId[] = ['en']) =>
  buildDocFromBible({ range, versions, main, refs, useShen, relationTypes: DEFAULT_RELATION_TYPES, settings: defaultSettings() });

describe('內建經文資料', () => {
  it('兩個版本都有 66 卷、1189 章，書卷代碼和程式裡的書卷表一致', () => {
    for (const b of [cuv, bsb]) {
      expect(Object.keys(b.books)).toEqual(BOOKS.map((x) => x.osis));
      expect(Object.values(b.books).reduce((a, ch) => a + ch.length, 0)).toBe(1189);
    }
  });
  it('已知的經文正確（約翰福音 3:16、創世記 1:1）', () => {
    expect(cuv.books.John[2][15]).toContain('甚至將他的獨生子賜給');
    expect(bsb.books.John[2][15]).toContain('For God so loved the world');
    expect(cuv.books.Gen[0][0]).toContain('起初');
    expect(bsb.books.Gen[0][0]).toContain('In the beginning');
  });
  it('來源與授權說明有隨資料一起放著', () => {
    const src = readFileSync(path.join(dir, 'SOURCES.md'), 'utf8');
    expect(src).toContain('公有領域');
    expect(src).toContain('dedicated to the public domain');
    expect(src).toContain('香港');
  });
});

describe('範圍與格式', () => {
  it('中文章號', () => {
    expect([1, 3, 10, 12, 21, 100, 119, 150].map(chineseNumber)).toEqual(['一', '三', '十', '十二', '二十一', '一百', '一百一十九', '一百五十']);
  });
  it('標題格式', () => {
    expect(formatRange({ book: 'John', from: { c: 3, v: 14 }, to: { c: 3, v: 21 } })).toBe('約翰福音三 14 至 21');
    expect(formatRange({ book: 'John', from: { c: 3, v: 16 }, to: { c: 3, v: 16 } })).toBe('約翰福音三 16');
    expect(formatRange({ book: 'Rom', from: { c: 8, v: 31 }, to: { c: 9, v: 5 } })).toBe('羅馬書 8:31 至 9:5');
  });
  it('檢查範圍：章節超出、迄點在起點之前、書卷不存在、太多節', () => {
    const r = (c1: number, v1: number, c2: number, v2: number, book = 'John') => validateRange(cuv, { book, from: { c: c1, v: v1 }, to: { c: c2, v: v2 } });
    expect(r(3, 14, 3, 21)).toBeNull();
    expect(r(3, 14, 3, 99)).toContain('節要介於');
    expect(r(22, 1, 22, 2)).toContain('章要介於');
    expect(r(3, 16, 3, 14)).toContain('不能在起點之前');
    expect(r(1, 1, 1, 1, 'Nope')).toContain('書卷');
    expect(r(1, 1, 21, 25)).toContain('最多帶入'); // 約翰福音全書 878 節 > 400
  });
  it('跨章展開', () => {
    const refs = rangeRefs(cuv, { book: 'John', from: { c: 3, v: 35 }, to: { c: 4, v: 2 } });
    expect(refs.map((x) => `${x.c}:${x.v}`)).toEqual(['3:35', '3:36', '4:1', '4:2']);
  });
});

describe('章節編號對不上的地方會提醒', () => {
  it('約翰福音 7（和合本沒有 7:53）與約翰三書、啟示錄 12', () => {
    expect(versificationWarnings(cuv, '和合本', [{ short: 'BSB', data: bsb }], { book: 'John', from: { c: 7, v: 1 }, to: { c: 7, v: 52 } })[0]).toContain('第 7 章');
    expect(versificationWarnings(cuv, '和合本', [{ short: 'BSB', data: bsb }], { book: 'John', from: { c: 3, v: 14 }, to: { c: 3, v: 21 } })).toEqual([]);
    expect(versificationWarnings(cuv, '和合本', [{ short: 'BSB', data: bsb }], { book: 'Rev', from: { c: 12, v: 1 }, to: { c: 12, v: 5 } }).length).toBe(1);
  });
});

describe('產生新文件', () => {
  it('約翰福音 3:14–21：每節一行、行首有經節標記、英文放在整節對照欄；文件通過驗證', () => {
    const r = build({ book: 'John', from: { c: 3, v: 14 }, to: { c: 3, v: 21 } });
    if ('error' in r) throw new Error(r.error);
    const { doc } = r;
    expect(validate(doc)).toEqual([]);
    expect(doc.meta.title).toBe('約翰福音三 14 至 21（和合本、BSB）');
    expect(doc.meta.credits).toContain('和合本');
    expect(doc.meta.credits).not.toContain('SBLGNT');
    expect(doc.meta.startChapter).toBe(3);
    const rows = rowsInOrder(doc);
    expect(rows.length).toBe(8);
    expect(rows[0].main[0]).toEqual({ t: 'verse', c: 3, v: 14, shown: true });
    expect(segsText(rows[2].main)).toContain('甚至將他的獨生子賜給');
    expect(doc.settings.main.lang).toBe('zh-Hant');
    const col = doc.settings.refColumns[0];
    expect(col.mode).toBe('verse');
    expect(col.lang).toBe('en');
    expect(Object.keys(col.verses!)).toEqual(['3:14', '3:15', '3:16', '3:17', '3:18', '3:19', '3:20', '3:21']);
    expect(segsText(col.verses!['3:16'])).toContain('For God so loved the world');
    expect(r.warnings).toEqual([]);
    // 每一節剛好一個區塊
    expect(verseBlocks(doc).length).toBe(8);
    const sv = startVerses(doc);
    expect(sv.get(rows[2].id)).toEqual({ c: 3, v: 16 });
  });

  it('可以選「神版用字」：把「上帝」換成「神」', () => {
    const range = { book: 'John', from: { c: 3, v: 16 }, to: { c: 3, v: 17 } };
    const a = build(range) as { doc: import('../src/core/types').Doc };
    const b = build(range, true) as { doc: import('../src/core/types').Doc };
    expect(segsText(rowsInOrder(a.doc)[0].main)).toContain('上帝');
    expect(segsText(rowsInOrder(b.doc)[0].main)).toContain('神');
    expect(segsText(rowsInOrder(b.doc)[0].main)).not.toContain('上帝');
  });

  it('和合本沒有的經節：仍然產生這一行（只有節號），並提醒', () => {
    // 找一節和合本是空的、BSB 有的
    let found: { book: string; c: number; v: number } | null = null;
    outer: for (const b of BOOKS) {
      const ch = cuv.books[b.osis];
      for (let c = 0; c < ch.length; c++) for (let v = 0; v < ch[c].length; v++) if (ch[c][v] === '' && bsb.books[b.osis][c]?.[v]) { found = { book: b.osis, c: c + 1, v: v + 1 }; break outer; }
    }
    expect(found).not.toBeNull();
    const f = found!;
    const r = build({ book: f.book, from: { c: f.c, v: f.v }, to: { c: f.c, v: f.v } });
    if ('error' in r) throw new Error(r.error);
    expect(r.warnings.join('|')).toContain(`和合本 沒有第 ${f.c}:${f.v} 節`);
    expect(rowsInOrder(r.doc)[0].main.length).toBe(1);
    expect(validate(r.doc)).toEqual([]);
  });

  it('超過一次可以帶入的節數會拒絕', () => {
    const r = build({ book: 'Ps', from: { c: 119, v: 1 }, to: { c: 150, v: 6 } });
    expect('error' in r && r.error).toContain('最多帶入');
  });
});

describe('選擇語言配置（分析欄 / 對照欄）', () => {
  const range = { book: 'John', from: { c: 3, v: 14 }, to: { c: 3, v: 21 } };
  const get = (main: LangId, refs: LangId[]) => {
    const r = build(range, false, main, refs);
    if ('error' in r) throw new Error(r.error);
    expect(validate(r.doc)).toEqual([]);
    return r;
  };

  it('SBLGNT 資料：27 卷新約、260 章，沒有殘留的版本記號；約翰福音 3:16 正確', () => {
    expect(Object.keys(sbl.books).length).toBe(27);
    expect(Object.values(sbl.books).reduce((a, c) => a + c.length, 0)).toBe(260);
    expect(sbl.books.John[2][15]).toContain('Οὕτως γὰρ ἠγάπησεν ὁ θεὸς τὸν κόσμον');
    expect(JSON.stringify(sbl.books)).not.toMatch(/[⸀-⸅]/);
  });

  it('希臘文放分析欄、中文＋英文放對照欄', () => {
    const { doc } = get('grc', ['zh-Hant', 'en']);
    expect(doc.settings.main.lang).toBe('grc');
    expect(doc.settings.refColumns.map((c) => [c.id, c.lang, c.mode])).toEqual([['c1', 'zh-Hant', 'verse'], ['c2', 'en', 'verse']]);
    expect(doc.settings.refColumns.every((c) => c.width === 0.22 && c.visible)).toBe(true);
    expect(segsText(rowsInOrder(doc)[2].main)).toContain('Οὕτως γὰρ ἠγάπησεν');
    expect(segsText(doc.settings.refColumns[0].verses!['3:16'])).toContain('甚至將他的獨生子賜給');
    expect(segsText(doc.settings.refColumns[1].verses!['3:16'])).toContain('For God so loved');
    expect(doc.meta.title).toBe('約翰福音三 14 至 21（SBLGNT、和合本、BSB）');
    expect(doc.meta.credits).toContain('SBL Greek New Testament © 2010 Society of Biblical Literature and Logos Bible Software, CC BY 4.0');
  });

  it('英文放分析欄、希臘文放對照欄（一個對照欄寬 30%）；只有分析欄時沒有對照欄、不強制橫向', () => {
    const a = get('en', ['grc']).doc;
    expect(a.settings.main.lang).toBe('en');
    expect(a.settings.refColumns.length).toBe(1);
    expect(a.settings.refColumns[0].width).toBe(0.3);
    const b = get('zh-Hant', []).doc;
    expect(b.settings.refColumns).toEqual([]);
    expect(b.settings.page.orientation).toBe('portrait');
    expect(get('zh-Hant', ['grc']).doc.settings.page.orientation).toBe('landscape');
  });

  it('以分析欄的版本決定有哪些節；不同版本節數不同時提醒', () => {
    // 約翰福音 7：和合本 52 節、BSB 與 SBLGNT 53 節
    const r = build({ book: 'John', from: { c: 7, v: 50 }, to: { c: 7, v: 52 } }, false, 'zh-Hant', ['en', 'grc']);
    if ('error' in r) throw new Error(r.error);
    expect(r.warnings.filter((w) => w.includes('第 7 章')).length).toBe(2);
    // 用 BSB 當分析欄就有 7:53
    const r2 = build({ book: 'John', from: { c: 7, v: 52 }, to: { c: 7, v: 53 } }, false, 'en', ['zh-Hant']);
    if ('error' in r2) throw new Error(r2.error);
    expect(rowsInOrder(r2.doc).length).toBe(2);
    expect(r2.warnings.join('|')).toContain('和合本 沒有第 7:53 節');
  });

  it('舊約沒有希臘文：不能選，也會被拒絕', () => {
    expect(availableLangs('Gen')).toEqual(['zh-Hant', 'en']);
    expect(availableLangs('John')).toEqual(['zh-Hant', 'en', 'grc']);
    expect(validateLayout('Gen', 'grc', [])).toContain('只有新約');
    expect(validateLayout('Gen', 'zh-Hant', ['grc'])).toContain('只有新約');
    const r = build({ book: 'Gen', from: { c: 1, v: 1 }, to: { c: 1, v: 3 } }, false, 'zh-Hant', ['grc']);
    expect('error' in r).toBe(true);
  });

  it('語言配置的限制：對照欄最多 2 個、不能重複、不能和分析欄相同', () => {
    expect(validateLayout('John', 'zh-Hant', ['en', 'grc'])).toBeNull();
    expect(validateLayout('John', 'zh-Hant', ['en', 'en'])).toContain('不能');
    expect(validateLayout('John', 'zh-Hant', ['zh-Hant'])).toContain('不能');
    expect(validateLayout('John', 'zh-Hant', ['en', 'grc', 'zh-Hant' as LangId])).toContain('最多 2 個');
  });

  it('SBLGNT 的 CC BY 要求：頁尾的來源說明有寫進文件，只有用到的版本才列', () => {
    const only = get('zh-Hant', ['en']).doc.meta.credits!;
    expect(only).not.toContain('SBLGNT');
    expect(get('grc', []).doc.meta.credits).toContain('CC BY 4.0');
    expect(VERSIONS.grc.credit).toContain('Society of Biblical Literature');
  });
});

// ───────────── 把內建經文加進既有文件的對照欄 ─────────────
import { Builder, T, V } from '../src/core/builder';
import * as C from '../src/core/commands';
import { planBibleColumn } from '../src/core/bible';
import type { Doc } from '../src/core/types';

/** 使用者自己貼上的分析欄（例如 NA28 希臘文），有經節標記，沒有對照欄 */
function userDoc(): Doc {
  const b = new Builder();
  const r1 = b.row([V(14), T('καὶ καθὼς Μωϋσῆς ὕψωσεν')]);
  const r2 = b.row('τὸν ὄφιν ἐν τῇ ἐρήμῳ');
  const r3 = b.row([V(15), T('ἵνα πᾶς ὁ πιστεύων')]);
  const r4 = b.row([V(16), T('Οὕτως γὰρ ἠγάπησεν')]);
  const d = b.build([r1, r2, r3, r4]);
  d.settings.main.lang = 'grc';
  d.meta.startChapter = 3;
  return d;
}
const okd = (r: C.Result): Doc => {
  if ('error' in r) throw new Error(r.error);
  expect(validate(r.doc)).toEqual([]);
  return r.doc;
};
const planOf = (doc: Doc, lang: LangId, book = 'John', shen = false) => {
  const p = planBibleColumn(doc, versions[lang], lang, book, shen);
  if ('error' in p) throw new Error(p.error);
  return p;
};
const spec = (doc: Doc, lang: LangId, colId: string | null, policy: C.ExistingVersePolicy = 'skip', book = 'John'): C.BibleColumnSpec => ({ colId, lang, book, texts: planOf(doc, lang, book).texts, policy });

describe('加入經文到既有文件的對照欄', () => {
  it('依文件裡的經節標記取出每一節（14、15、16），分析欄完全不動', () => {
    const doc = userDoc();
    const p = planOf(doc, 'en');
    expect(p.keys).toEqual(['3:14', '3:15', '3:16']);
    expect(Object.keys(p.texts)).toEqual(p.keys);
    expect(p.texts['3:16']).toContain('For God so loved the world');
    const out = okd(C.addBibleColumn(doc, spec(doc, 'en', null)));
    expect(rowsInOrder(out)).toEqual(rowsInOrder(doc)); // 分析欄一個字都沒變
    expect(out.items).toEqual(doc.items);
    expect(out.settings.main).toEqual(doc.settings.main);
    const col = out.settings.refColumns[0];
    expect([col.id, col.lang, col.mode, col.visible, col.width]).toEqual(['c1', 'en', 'verse', true, 0.25]);
    expect(segsText(col.verses!['3:15'])).toContain('that everyone who believes');
    expect(out.meta.book).toBe('John');
  });

  it('可以加兩個版本；第三個會被拒絕；SBLGNT 的來源標示只加一次', () => {
    let doc = userDoc();
    doc = okd(C.addBibleColumn(doc, spec(doc, 'zh-Hant', null)));
    expect(doc.meta.credits).toContain('和合本');
    doc = okd(C.addBibleColumn(doc, spec(doc, 'grc', null)));
    expect(doc.settings.refColumns.map((c) => c.lang)).toEqual(['zh-Hant', 'grc']);
    expect(doc.meta.credits!.match(/CC BY 4\.0/g)!.length).toBe(1);
    // 再加到既有的 SBLGNT 欄：來源標示不重複
    doc = okd(C.addBibleColumn(doc, { ...spec(doc, 'grc', 'c2'), policy: 'overwrite' }));
    expect(doc.meta.credits!.match(/CC BY 4\.0/g)!.length).toBe(1);
    const third = C.addBibleColumn(doc, spec(doc, 'en', null));
    expect('error' in third && third.error).toContain('最多 2 個');
  });

  it('加到既有的整節欄：已有內容的那幾節依選擇處理（略過／覆蓋／接在後面）', () => {
    let doc = userDoc();
    doc = okd(C.addBibleColumn(doc, spec(doc, 'en', null)));
    doc = okd(C.setVerseText(doc, 'c1', '3:15', [T('我自己寫的')]));
    const text = (d: Doc, k: string) => segsText(d.settings.refColumns[0].verses![k]);
    const skip = okd(C.addBibleColumn(doc, spec(doc, 'en', 'c1', 'skip')));
    expect(text(skip, '3:15')).toBe('我自己寫的');
    expect(text(skip, '3:14')).toContain('Just as Moses');
    const over = okd(C.addBibleColumn(doc, spec(doc, 'en', 'c1', 'overwrite')));
    expect(text(over, '3:15')).toContain('that everyone who believes');
    const app = okd(C.addBibleColumn(doc, spec(doc, 'en', 'c1', 'append')));
    expect(text(app, '3:15').startsWith('我自己寫的')).toBe(true);
    expect(text(app, '3:15')).toContain('that everyone who believes');
  });

  it('既有的逐行對照欄：改成整節模式，逐行的內容仍然保留；欄語言改成選的版本', () => {
    let doc = userDoc();
    doc.settings.refColumns = [{ id: 'c1', lang: 'zh-Hant', visible: true, width: 0.2, mode: 'row' }];
    rowsInOrder(doc)[0].refs = { c1: [T('逐行寫的')] };
    const r = C.addBibleColumn(doc, spec(doc, 'grc', 'c1'));
    if ('error' in r) throw new Error(r.error);
    expect(r.notices.join('|')).toContain('改成了「整節」模式');
    expect(validate(r.doc)).toEqual([]);
    expect(r.doc.settings.refColumns[0].mode).toBe('verse');
    expect(r.doc.settings.refColumns[0].lang).toBe('grc');
    expect(segsText(rowsInOrder(r.doc)[0].refs.c1)).toBe('逐行寫的');
  });

  it('沒有經節標記、舊約選希臘文、沒選書卷、找不到任何一節：給出明確的原因', () => {
    const b = new Builder();
    const noMarks = b.build([b.row('只有文字'), b.row('沒有節號')]);
    const e1 = planBibleColumn(noMarks, bsb, 'en', 'John');
    expect('error' in e1 && e1.error).toContain('經節標記');
    const e2 = planBibleColumn(userDoc(), sbl, 'grc', 'Gen');
    expect('error' in e2 && e2.error).toContain('只有新約');
    const e3 = planBibleColumn(userDoc(), bsb, 'en', '');
    expect('error' in e3 && e3.error).toContain('選擇書卷');
    const e4 = planBibleColumn(userDoc(), bsb, 'en', 'Ruth'); // 路得記只有 4 章，3:14 以後有，但 3:15、3:16 不存在
    expect('error' in e4).toBe(false);
    const wrong = planBibleColumn(userDoc(), bsb, 'en', 'Obad');
    expect('error' in wrong && wrong.error).toContain('找不到文件中的任何一節');
  });

  it('文件裡有、但該版本沒有的節：列在 missing，其他節照放', () => {
    const b = new Builder();
    const doc = b.build([b.row([V(7, 7), T('x')]), b.row([V(53, 7), T('y')])]); // 7:53 和合本沒有（52 節）
    doc.settings.main.lang = 'grc';
    const p = planBibleColumn(doc, cuv, 'zh-Hant', 'John');
    if ('error' in p) throw new Error(p.error);
    expect(p.missing).toContain('7:53');
    expect(Object.keys(p.texts)).toContain('7:7');
  });

  it('神版用字', () => {
    const doc = userDoc();
    expect(planOf(doc, 'zh-Hant', 'John', true).texts['3:16']).toContain('神');
    expect(planOf(doc, 'zh-Hant', 'John', true).texts['3:16']).not.toContain('上帝');
    expect(planOf(doc, 'zh-Hant', 'John', false).texts['3:16']).toContain('上帝');
  });

  it('頁面寬度：其他欄已占滿時，新的對照欄會縮小；完全放不下就拒絕', () => {
    let doc = userDoc();
    doc.settings.refColumns = [{ id: 'c1', lang: 'en', visible: true, width: 0.5, mode: 'row' }];
    expect(C.newColumnWidth(doc)).toBe(0.2);
    doc.settings.refColumns[0].width = 0.5;
    doc.settings.refColumns.push({ id: 'c2', lang: 'zh-Hant', visible: false, width: 0.5, mode: 'row' }); // 隱藏的不算
    expect(C.newColumnWidth(doc)).toBe(0.2);
    doc = structuredClone(doc);
    doc.settings.refColumns = [{ id: 'c1', lang: 'en', visible: true, width: 0.5, mode: 'row' }, { id: 'c2', lang: 'en', visible: true, width: 0.2, mode: 'row' }];
    expect(C.newColumnWidth(doc)).toBe(0);
  });
});
