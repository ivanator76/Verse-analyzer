import { Builder, T, V } from './builder';
import type { Doc, Item, Row } from './types';

/**
 * 約翰福音 3:14–21 的括號分析（測試與本機範例用的文件）。
 *
 * 括號結構、關係、主次、縮排是照《01_約翰福音03.14-21.pdf》（LibreOffice 手工版）重做的，
 * 用來做驗收項目 1 的並排比對。希臘文用字採用 SBLGNT（CC BY 4.0，
 * SBL Greek New Testament © 2010 Society of Biblical Literature and Logos Bible Software），
 * 只有 3:16 的「ὁ θεὸς」（方括號是分析者補上的）是分析時另外加的。
 * 這份文件不會出現在公開的網頁版裡（npm run build:public 會拿掉）。
 */
export function sampleJohn3(): Doc {
  const b = new Builder();
  const r = (t: string, indent = 0) => b.row(t, indent);
  const rv = (v: number, t: string, indent = 0) => b.row([V(v), T(t)], indent);
  const m = (...types: string[]) => types; // 主句的關係

  // ── 14 ──
  const R1 = rv(14, 'Καὶ καθὼς Μωϋσῆς ὕψωσεν τὸν ὄφιν');
  const R2 = r('ἐν τῇ ἐρήμῳ,', 8);
  const R3 = r('οὕτως ὑψωθῆναι δεῖ τὸν υἱὸν τοῦ ἀνθρώπου,');
  const A1 = b.bracket(['space'], [[R1, m('space')], [R2]]);
  const A2 = b.bracket(['compare'], [[A1], [R3]]);
  // ── 15 ──
  const R4 = rv(15, 'ἵνα πᾶς ὁ πιστεύων');
  const R5 = r('ἐν αὐτῷ', 5);
  const R6 = r('ἔχῃ ζωὴν αἰώνιον.', 8);
  const A4 = b.bracket(['explain'], [[R4], [R5, m('explain')]]);
  const A5 = b.bracket(['explain'], [[A4], [R6, m('explain')]]);
  const A6 = b.bracket(['purpose'], [[A2], [A5, m('purpose')]]);
  // ── 16 ──
  const R7 = rv(16, 'γὰρ ὁ θεὸς ἠγάπησεν τὸν κόσμον,');
  const R8 = r('οὕτως', 6);
  const R9 = r('ὥστε [ὁ θεὸς] ἔδωκεν τὸν υἱὸν τὸν μονογενῆ,');
  const G = b.bracket(['explain'], [[R7], [R8, m('explain')]]);
  const C16 = b.bracket(['cause-effect'], [[G], [R9, m('cause-effect')]]);
  const R10 = r('ἵνα πᾶς ὁ πιστεύων');
  const R11 = r('εἰς αὐτὸν', 4);
  const R12 = r('μὴ ἀπόληται', 7);
  const R13 = r('ἀλλὰ ἔχῃ ζωὴν αἰώνιον.');
  const F = b.bracket(['explain'], [[R10], [R11, m('explain')]]);
  const E = b.bracket(['explain'], [[F], [R12, m('explain')]]);
  const D = b.bracket(['not-but'], [[E], [R13, m('not-but')]]);
  const B = b.bracket(['purpose'], [[C16], [D, m('purpose')]]);
  const A7 = b.bracket(['progress'], [[A6], [B, m('progress')]]);
  // ── 17 ──
  const R14 = rv(17, 'γὰρ ὁ θεὸς ἀπέστειλεν τὸν υἱὸν');
  const R15 = r('εἰς τὸν κόσμον', 6);
  const R16 = b.row([{ t: 'text', text: 'Οὐ', marks: [{ k: 'u' }] }, T(' ἵνα κρίνῃ τὸν κόσμον,')]);
  const R17 = r('ἀλλʼ ἵνα σωθῇ ὁ κόσμος');
  const R18 = r('διʼ αὐτοῦ.', 3);
  const K = b.bracket(['space'], [[R14, m('space')], [R15]]);
  const J = b.bracket(['purpose'], [[K], [R16, m('purpose')]]);
  const L = b.bracket(['manner'], [[R17, m('manner')], [R18]]);
  const I = b.bracket(['not-but'], [[J], [L, m('not-but')]]);
  const H = b.bracket(['progress'], [[A7], [I, m('progress')]]);
  // ── 18 ──
  const R19 = rv(18, 'ὁ πιστεύων εἰς αὐτὸν οὐ κρίνεται·');
  const R20 = r('δὲ ὁ μὴ πιστεύων ἤδη κέκριται,');
  const R21 = r('ὅτι μὴ πεπίστευκεν');
  const R22 = r('εἰς τὸ ὄνομα τοῦ μονογενοῦς υἱοῦ τοῦ θεοῦ.', 3);
  const Q = b.bracket(['not-but'], [[R19], [R20, m('not-but')]]);
  const R = b.bracket(['explain'], [[R21], [R22, m('explain')]]);
  const N = b.bracket(['cause-effect'], [[Q, m('cause-effect')], [R]]);
  const M = b.bracket(['explain'], [[H], [N, m('explain')]]);
  // ── 19 ──
  const R23 = rv(19, 'δέ αὕτη ἐστιν ἡ κρίσις');
  const R24 = r('ὅτι τὸ φῶς ἐλήλυθεν');
  const R25 = r('εἰς τὸν κόσμον', 5);
  const V19 = b.bracket(['space'], [[R24, m('space')], [R25]]);
  const R26 = r('καὶ οἱ ἄνθρωποι ἠγάπησαν μᾶλλον   τὸ σκότος');
  const R27 = r('ἢ τὸ φῶς·', 11);
  const R28 = r('γὰρ τὰ ἔργα αὐτῶν ἦν πονηρὰ.');
  const X = b.bracket(['not-but'], [[R26, m('not-but')], [R27]]);
  const W = b.bracket(['cause-effect'], [[X, m('cause-effect')], [R28]]);
  const T19 = b.bracket(['progress'], [[V19], [W, m('progress')]]);
  // ── 20 ──
  const R29 = rv(20, 'πᾶς γὰρ ὁ φαῦλα πράσσων μισεῖ τὸ φῶς');
  const R30 = r('καὶ οὐκ ἔρχεται');
  const R31 = r('πρὸς τὸ φῶς,', 4);
  const R32 = r('ἵνα τὰ ἔργα αὐτοῦ μὴ ἐλεγχθῇ·');
  const AB = b.bracket(['explain'], [[R30], [R31, m('explain')]]);
  const AA = b.bracket(['purpose'], [[AB], [R32, m('purpose')]]);
  const Y = b.bracket(['and'], [[R29], [AA]]);
  // ── 21 ──
  const R33 = rv(21, 'ὁ δὲ ποιῶν τὴν ἀλήθειαν ἔρχεται πρὸς τὸ φῶς,');
  const R34 = r('ἵνα φανερωθῇ αὐτοῦ τὰ ἔργα');
  const R35 = r('ὅτι ἐν θεῷ ἐστιν εἰργασμένα.');
  const AC = b.bracket(['explain'], [[R34], [R35, m('explain')]]);
  const Z = b.bracket(['purpose'], [[R33], [AC, m('purpose')]]);
  const U = b.bracket(['although'], [[Y], [Z, m('although')]]);
  const S = b.bracket(['explain'], [[T19], [U, m('explain')]]);
  const P = b.bracket(['explain'], [[R23], [S, m('explain')]]);
  const O = b.bracket(['cause-effect'], [[M], [P, m('cause-effect')]]);

  const doc = b.build([O as Item]);
  // 參考 PDF 在「方式」這一組只印 *，沒有印「果」→ 用自訂文字
  const setText = (br: typeof L, childId: string, text: string) => {
    const c = br.children.find((x) => x.item.id === childId)!;
    for (const k of Object.keys(c.labels)) c.labels[k].text = text;
  };
  setText(L, R17.id, '*');
  doc.meta = {
    title: '約翰福音三 14 至 21（範例）',
    book: 'John',
    startChapter: 3,
    credits: '經文來源：SBL Greek New Testament © 2010 Society of Biblical Literature and Logos Bible Software, CC BY 4.0',
  };
  doc.settings.indentStep = 5.1; // 參考 PDF 的每階寬度約 14.5pt
  doc.settings.treePadLeft = 20; // 參考 PDF 的樹狀區左邊留白
  return doc;
}

/**
 * 跨頁壓力測試用：把約翰福音 3:14–21 重複 copies 次（章節遞增、id 重新編號），
 * 外面包一層「進展」括號讓括號跨頁；開啟兩個對照欄並填入長短不一的文字。
 */
export function stressDoc(copies = 2): Doc {
  const base = sampleJohn3();
  const items: Item[] = [];
  const rename = (id: string, k: number) => `${id}_${k}`;
  const cloneItem = (it: Item, k: number): Item => {
    if (it.kind === 'row') {
      return {
        ...structuredClone(it),
        id: rename(it.id, k),
        main: it.main.map((s) => (s.t === 'verse' ? { ...s, c: s.c + k } : { ...s })),
      };
    }
    const relMap = new Map(it.relations.map((r) => [r.id, rename(r.id, k)]));
    return {
      kind: 'bracket',
      id: rename(it.id, k),
      relations: it.relations.map((r) => ({ ...r, id: relMap.get(r.id)! })),
      children: it.children.map((c) => ({
        labels: Object.fromEntries(Object.entries(c.labels).map(([rid, lab]) => [relMap.get(rid)!, { ...lab }])),
        item: cloneItem(c.item, k),
      })),
    };
  };
  for (let k = 0; k < copies; k++) items.push(cloneItem(base.items[0].item, k));

  const wrapper: Item = {
    kind: 'bracket',
    id: 'stress-root',
    relations: [{ id: 'stress-q', type: 'and' }],
    children: items.map((item) => ({ labels: { 'stress-q': { text: null, main: false, pending: false } }, item })),
  };
  const doc: Doc = { ...base, items: [{ labels: {}, item: copies > 1 ? wrapper : items[0] }] };
  doc.meta = { title: `約翰福音三（重複 ${copies} 次，跨頁壓力測試）`, startChapter: 3 };
  doc.settings.refColumns = [
    { id: 'c1', lang: 'en', visible: true, width: 0.2, mode: 'row' },
    { id: 'c2', lang: 'zh-Hant', visible: true, width: 0.16, mode: 'row' },
  ];
  // 三欄 + 這份範例最深 11 階縮排：直向放不下（會出現「版面過窄」），所以預設橫向
  doc.settings.page.orientation = 'landscape';
  doc.settings.treePadLeft = 0;
  const en = ['As Moses lifted up the serpent in the wilderness,', 'so must the Son of Man be lifted up,', 'that whoever believes in him may have eternal life.', 'For God so loved the world, that he gave his only Son,'];
  const zh = ['摩西在曠野怎樣舉起蛇，', '人子也必照樣被舉起來，', '叫一切信他的都得永生。', '神愛世人，甚至將他的獨生子賜給他們。'];
  const rows: Row[] = [];
  const walk = (it: Item) => (it.kind === 'row' ? rows.push(it) : it.children.forEach((c) => walk(c.item)));
  walk(doc.items[0].item);
  rows.forEach((r, i) => {
    const e = en[i % en.length] + (i % 7 === 3 ? ' ' + en[(i + 1) % en.length] : '');
    r.refs = { c1: [{ t: 'text', text: e, marks: [] }], c2: i % 2 === 0 ? [{ t: 'text', text: zh[i % zh.length], marks: [] }] : [] };
  });
  // 每隔幾行放一個手動分頁點，測試強制換頁
  return doc;
}
