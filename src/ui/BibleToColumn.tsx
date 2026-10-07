import { useEffect, useMemo, useState } from 'react';
import { BOOKS, VERSIONS, LANG_IDS, availableLangs, planBibleColumn, type BibleData, type LangId } from '../core/bible';
import type { BibleColumnSpec, ExistingVersePolicy } from '../core/commands';
import { newColumnWidth } from '../core/commands';
import { langName } from '../core/fonts';
import { segsText } from '../core/tree';
import type { Doc } from '../core/types';
import { loadVersion } from './bibleData';
import { HelpLink } from './HelpLink';

const OT = BOOKS.slice(0, 39);
const NT = BOOKS.slice(39);

/**
 * 把內建經文（和合本、BSB、SBLGNT）加進目前這份文件的對照欄。
 * 依文件裡已經有的經節標記，每一節放進對照欄（整節模式）；分析欄完全不動。
 */
export function BibleToColumn({ doc, onApply, onClose }: { doc: Doc; onApply(spec: BibleColumnSpec): void; onClose(): void }) {
  const cols = doc.settings.refColumns;
  const [book, setBook] = useState(doc.meta.book ?? '');
  const [lang, setLang] = useState<LangId>(doc.settings.main.lang === 'zh-Hant' ? 'en' : 'zh-Hant');
  const [target, setTarget] = useState<string>(cols.length < 2 ? 'new' : cols[0].id);
  const [policy, setPolicy] = useState<ExistingVersePolicy>('skip');
  const [useShen, setUseShen] = useState(false);
  const [data, setData] = useState<Partial<Record<LangId, BibleData>>>({});
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => {
    if (!data[lang]) loadVersion(lang).then((d) => setData((c) => ({ ...c, [lang]: d }))).catch((e) => setLoadErr(String(e)));
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const avail = book ? availableLangs(book) : LANG_IDS;
  const effLang: LangId = avail.includes(lang) ? lang : 'zh-Hant';
  const plan = useMemo(() => (data[effLang] ? planBibleColumn(doc, data[effLang]!, effLang, book, useShen) : null), [doc, data, effLang, book, useShen]);
  const ok = plan && !('error' in plan) ? plan : null;
  const col = target === 'new' ? null : cols.find((c) => c.id === target) ?? null;
  const existing = ok && col ? Object.keys(ok.texts).filter((k) => segsText(col.verses?.[k] ?? []).trim() !== '').length : 0;
  const widthOk = target !== 'new' || newColumnWidth(doc) >= 0.05;
  const canApply = !!ok && widthOk && !loadErr;

  return (
    <div className="modal-back screen-only" onMouseDown={onClose}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <h3>加入經文到對照欄 <HelpLink topic="bible-column" /></h3>
        <p className="hint">依這份文件裡已經有的經節標記，把內建經文逐節放進對照欄。<b>分析欄不會被改動</b>（例如你自己貼上的 NA28）。</p>
        <div className="grid">
          <label>書卷</label>
          <select value={book} onChange={(e) => setBook(e.target.value)}>
            <option value="" disabled>請選擇…</option>
            <optgroup label="舊約">{OT.map((b) => <option key={b.osis} value={b.osis}>{b.zh}</option>)}</optgroup>
            <optgroup label="新約">{NT.map((b) => <option key={b.osis} value={b.osis}>{b.zh}</option>)}</optgroup>
          </select>
          <label>版本</label>
          <span className="langrow">
            {LANG_IDS.map((l) => (
              <label key={l} className={avail.includes(l) ? '' : 'off'} title={avail.includes(l) ? '' : '希臘文 SBLGNT 只有新約'}>
                <input type="radio" name="bl" disabled={!avail.includes(l)} checked={effLang === l} onChange={() => setLang(l)} /> {VERSIONS[l].name}
              </label>
            ))}
          </span>
          <label>加到</label>
          <span className="langrow">
            <label className={cols.length >= 2 ? 'off' : ''} title={cols.length >= 2 ? '對照欄最多 2 個' : ''}>
              <input type="radio" name="bt" disabled={cols.length >= 2} checked={target === 'new'} onChange={() => setTarget('new')} /> 新的對照欄
            </label>
            {cols.map((c, i) => (
              <label key={c.id}>
                <input type="radio" name="bt" checked={target === c.id} onChange={() => setTarget(c.id)} /> 對照欄 {i + 1}（{langName(c.lang)}，{c.mode === 'verse' ? '整節' : '逐行'}）
              </label>
            ))}
          </span>
          {existing > 0 && (
            <>
              <label>已有內容</label>
              <span className="langrow">
                <span className="hint">{existing} 節已經有內容：</span>
                <label><input type="radio" name="bp" checked={policy === 'skip'} onChange={() => setPolicy('skip')} /> 保留原本的（略過）</label>
                <label><input type="radio" name="bp" checked={policy === 'overwrite'} onChange={() => setPolicy('overwrite')} /> 覆蓋</label>
                <label><input type="radio" name="bp" checked={policy === 'append'} onChange={() => setPolicy('append')} /> 接在後面</label>
              </span>
            </>
          )}
          {effLang === 'zh-Hant' && (
            <>
              <label>用字</label>
              <label style={{ fontSize: 13 }}><input type="checkbox" checked={useShen} onChange={(e) => setUseShen(e.target.checked)} /> 改用「神」字（把「上帝」換成「神」）</label>
            </>
          )}
        </div>

        {loadErr && <p className="errs">載入經文資料失敗：{loadErr}</p>}
        {!plan && book && !loadErr && <p className="hint">載入經文資料中…</p>}
        {plan && 'error' in plan && <p className="errs">{plan.error}</p>}
        {!widthOk && <p className="errs">頁面寬度已經被其他對照欄占滿，沒有空間放新的對照欄。請先縮小或關閉其他對照欄，或選一個既有的對照欄。</p>}
        {col && col.lang !== effLang && <p className="hint">⚠ 這個對照欄原本的語言是「{langName(col.lang)}」，會改成「{langName(effLang)}」。</p>}
        {col && col.mode !== 'verse' && <p className="hint">⚠ 這個對照欄原本是「逐行」模式，會改成「整節」模式（原本逐行的內容仍然保留，之後可以切回去）。</p>}
        {effLang === doc.settings.main.lang && <p className="hint">注意：這個版本的語言和分析欄相同。</p>}
        {ok && (
          <div className="bible-prev">
            <b>文件裡的 {ok.keys.length} 節</b>（{ok.keys[0]} 到 {ok.keys[ok.keys.length - 1]}）→ {VERSIONS[effLang].short}
            {ok.keys.slice(0, 3).map((k) => (
              <div key={k} className="bp-row">
                <sup>{k}</sup> {ok.texts[k] ?? <i>（{VERSIONS[effLang].short} 沒有這一節）</i>}
              </div>
            ))}
            {ok.keys.length > 3 && <div className="hint">…</div>}
            {ok.missing.length > 0 && <ul className="warnings"><li>⚠ {VERSIONS[effLang].short} 找不到這幾節（那幾節的欄位會是空的）：{ok.missing.slice(0, 8).join('、')}{ok.missing.length > 8 ? `…（共 ${ok.missing.length} 節）` : ''}</li></ul>}
          </div>
        )}
        <p className="hint" style={{ marginTop: 10 }}>來源與授權：和合本（公有領域；港澳請自行確認）、BSB（公有領域）、SBLGNT（CC BY 4.0，需標示來源）。加入 SBLGNT 時，文件頁尾會自動補上來源標示。</p>
        <div className="modal-buttons">
          <button
            className="primary"
            disabled={!canApply}
            onClick={() => {
              if (!ok) return;
              onClose();
              onApply({ colId: col ? col.id : null, lang: effLang, book, texts: ok.texts, policy });
            }}
          >
            加入對照欄
          </button>
          <button onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
