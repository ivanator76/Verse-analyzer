import { useEffect, useMemo, useState } from 'react';
import {
  BOOKS, VERSIONS, LANG_IDS, availableLangs, buildDocFromBible, chapterCount, formatRange, rangeRefs, validateLayout, validateRange, verseCount, versificationWarnings,
  type BibleData, type BibleRange, type LangId,
} from '../core/bible';
import type { Doc } from '../core/types';
import { loadVersion } from './bibleData';
import { HelpLink } from './HelpLink';
import { getPrefs, getRelationTypes } from './prefs';

const OT = BOOKS.slice(0, 39);
const NT = BOOKS.slice(39);

// 元件定義在外面（定義在對話框裡面，輸入框每按一個鍵就會失去焦點）
function Num({ v, set, max }: { v: number; set(n: number): void; max?: number }) {
  return <input type="number" min={1} max={max} style={{ width: 64 }} value={Number.isNaN(v) ? '' : v} onChange={(e) => set(e.target.value === '' ? NaN : Number(e.target.value))} />;
}

/** 帶入經文：選書卷與範圍、選哪個語言放分析欄、哪些放對照欄，自動產生一份新文件。 */
export function BibleImport({ onCreate, onClose }: { onCreate(doc: Doc, notes: string[]): void; onClose(): void }) {
  const [data, setData] = useState<Partial<Record<LangId, BibleData>>>({});
  const [loadErr, setLoadErr] = useState('');
  const [book, setBook] = useState('John');
  const [fc, setFc] = useState(3);
  const [fv, setFv] = useState(14);
  const [tc, setTc] = useState(3);
  const [tv, setTv] = useState(21);
  const [useShen, setUseShen] = useState(false);
  const [main, setMain] = useState<LangId>('zh-Hant');
  const [refs, setRefs] = useState<LangId[]>(['en']);

  const avail = availableLangs(book);
  // 這卷書沒有的版本（舊約沒有希臘文）自動拿掉
  const effMain: LangId = avail.includes(main) ? main : 'zh-Hant';
  const effRefs = refs.filter((l) => avail.includes(l) && l !== effMain);
  const used = [effMain, ...effRefs];
  const layoutErr = validateLayout(book, effMain, effRefs);

  useEffect(() => {
    for (const l of used)
      if (!data[l]) loadVersion(l).then((d) => setData((cur) => ({ ...cur, [l]: d }))).catch((e) => setLoadErr(String(e)));
  }, [used.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const structure = data[effMain];
  const loaded = used.every((l) => data[l]);
  const range: BibleRange = { book, from: { c: fc, v: fv }, to: { c: tc, v: tv } };
  const err = structure ? validateRange(structure, range) : null;
  const refList = useMemo(() => (structure && !err ? rangeRefs(structure, range) : []), [structure, err, book, fc, fv, tc, tv]); // eslint-disable-line react-hooks/exhaustive-deps
  const warn =
    structure && !err && loaded
      ? versificationWarnings(structure, VERSIONS[effMain].short, effRefs.map((l) => ({ short: VERSIONS[l].short, data: data[l]! })), range)
      : [];

  const pickBook = (osis: string) => {
    setBook(osis);
    const d = data[effMain];
    // 換書卷：預設選第 1 章（太長就先選前 20 節）
    const n = d ? Math.min(verseCount(d, osis, 1), 20) : 1;
    setFc(1); setFv(1); setTc(1); setTv(n);
  };
  const toggleRef = (l: LangId) => setRefs((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l].slice(0, 2)));
  const pickMain = (l: LangId) => {
    setMain(l);
    setRefs((cur) => cur.filter((x) => x !== l));
  };

  const text = (l: LangId, r: { c: number; v: number }) => {
    const t = data[l]?.books[book]?.[r.c - 1]?.[r.v - 1] ?? '';
    return l === 'zh-Hant' && useShen ? t.replace(/上帝/g, '神') : t;
  };

  return (
    <div className="modal-back screen-only" onMouseDown={onClose}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <h3>帶入經文 <HelpLink topic="bible" /></h3>
        <p className="hint">選好書卷、範圍，再決定哪個語言放分析欄、哪些放對照欄，會建立一份新文件（每一節一行，行首有經節標記）。</p>
        {loadErr && <p className="errs">載入經文資料失敗：{loadErr}</p>}
        <div className="grid">
          <label>書卷</label>
          <select value={book} onChange={(e) => pickBook(e.target.value)}>
            <optgroup label="舊約">{OT.map((b) => <option key={b.osis} value={b.osis}>{b.zh}</option>)}</optgroup>
            <optgroup label="新約">{NT.map((b) => <option key={b.osis} value={b.osis}>{b.zh}</option>)}</optgroup>
          </select>
          {structure && (
            <>
              <label>從</label>
              <span>第 <Num v={fc} set={(n) => { setFc(n); if (n > tc) setTc(n); }} max={chapterCount(structure, book)} /> 章　第 <Num v={fv} set={setFv} max={verseCount(structure, book, fc)} /> 節</span>
              <label>到</label>
              <span>第 <Num v={tc} set={setTc} max={chapterCount(structure, book)} /> 章　第 <Num v={tv} set={setTv} max={verseCount(structure, book, tc)} /> 節
                <span className="hint">　（共 {chapterCount(structure, book)} 章；第 {tc} 章有 {verseCount(structure, book, tc)} 節）</span></span>
            </>
          )}
          <label>分析欄</label>
          <span className="langrow">
            {LANG_IDS.map((l) => (
              <label key={l} className={avail.includes(l) ? '' : 'off'} title={avail.includes(l) ? '' : '希臘文 SBLGNT 只有新約'}>
                <input type="radio" name="main" disabled={!avail.includes(l)} checked={effMain === l} onChange={() => pickMain(l)} /> {VERSIONS[l].name}
              </label>
            ))}
          </span>
          <label>對照欄<br /><span className="hint">（最多 2 個）</span></label>
          <span className="langrow">
            {LANG_IDS.map((l) => (
              <label key={l} className={avail.includes(l) && l !== effMain ? '' : 'off'}>
                <input type="checkbox" disabled={!avail.includes(l) || l === effMain || (!effRefs.includes(l) && effRefs.length >= 2)} checked={effRefs.includes(l)} onChange={() => toggleRef(l)} /> {VERSIONS[l].name}
              </label>
            ))}
          </span>
          <label>用字</label>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={useShen} onChange={(e) => setUseShen(e.target.checked)} /> 和合本改用「神」字（把「上帝」換成「神」，神版用字）</label>
        </div>

        {!structure && !loadErr && <p className="hint">載入經文資料中…</p>}
        {layoutErr && <p className="errs">{layoutErr}</p>}
        {err && !layoutErr && <p className="errs">{err}</p>}
        {structure && !err && !layoutErr && (
          <div className="bible-prev">
            <b>{formatRange(range)}</b>（共 {refList.length} 節）　分析欄：{VERSIONS[effMain].short}
            {effRefs.length ? `　對照欄：${effRefs.map((l) => VERSIONS[l].short).join('、')}` : '　（沒有對照欄）'}
            {refList.slice(0, 3).map((r) => (
              <div key={`${r.c}:${r.v}`} className="bp-row">
                {used.map((l, i) => (
                  <div key={l} className={i ? 'en' : ''}>
                    <sup>{i === 0 ? `${r.c}:${r.v}` : VERSIONS[l].short}</sup> {text(l, r) || (data[l] ? <i>（{VERSIONS[l].short} 沒有這一節）</i> : '…')}
                  </div>
                ))}
              </div>
            ))}
            {refList.length > 3 && <div className="hint">…</div>}
            {warn.length > 0 && <ul className="warnings">{warn.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>}
          </div>
        )}
        <p className="hint" style={{ marginTop: 10 }}>
          來源：和合本（1919，公有領域；香港、澳門請自行確認）、BSB（2023 年起公有領域）、SBLGNT（CC BY 4.0，文件頁尾會標示來源）。細節見使用說明。
        </p>
        <div className="modal-buttons">
          <button
            className="primary"
            disabled={!structure || !loaded || !!err || !!layoutErr}
            onClick={() => {
              const r = buildDocFromBible({ range, versions: data, main: effMain, refs: effRefs, useShen, relationTypes: getRelationTypes(), settings: getPrefs().newDoc });
              if ('error' in r) return;
              onClose();
              onCreate(r.doc, r.warnings);
            }}
          >
            建立新文件
          </button>
          <button onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
