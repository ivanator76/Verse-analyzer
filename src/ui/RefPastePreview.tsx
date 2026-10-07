import { useMemo, useState } from 'react';
import { HelpLink } from './HelpLink';
import {
  planRefPaste,
  resolvePlan,
  suggestMode,
  type ExistingPolicy,
  type LeftoverPolicy,
  type PasteMode,
} from '../core/refpaste';
import type { Doc, Seg } from '../core/types';

const clip = (t: string, n = 16) => (t.length > n ? t.slice(0, n) + '…' : t);

/** §8 貼上到對照欄的預覽對話框：標出已有內容的格子、找不到對應行的經節、超出最後一行的文字。 */
export function RefPastePreview({
  doc,
  colId,
  startRowId,
  text,
  onApply,
  onClose,
}: {
  doc: Doc;
  colId: string;
  startRowId: string;
  text: string;
  onApply(cells: { key: string; segs: Seg[] }[], summary: string): void;
  onClose(): void;
}) {
  const [mode, setMode] = useState<PasteMode>(() => suggestMode(doc, text));
  const [defExisting, setDefExisting] = useState<ExistingPolicy>('overwrite');
  const [perCell, setPerCell] = useState<Record<string, ExistingPolicy>>({});
  const [leftover, setLeftover] = useState<LeftoverPolicy>('merge-last');
  const plan = useMemo(() => planRefPaste(doc, colId, startRowId, text, mode), [doc, colId, startRowId, text, mode]);
  const col = doc.settings.refColumns.find((c) => c.id === colId);
  const order = useMemo(() => {
    const ids: string[] = [];
    const walk = (l: Doc['items']) => l.forEach((c) => (c.item.kind === 'row' ? ids.push(c.item.id) : walk(c.item.children)));
    walk(doc.items);
    return ids;
  }, [doc]);

  const withExisting = plan.targets.filter((t) => t.existing !== '');
  const resolved = resolvePlan(doc, plan, { existing: perCell, defaultExisting: defExisting, leftover });
  const cannot = plan.error ? plan.error : resolved === null ? '有無法放進去的文字，請選「併入最後一行」或取消' : resolved.length === 0 ? '沒有任何格子會被改動' : '';

  return (
    <div className="modal-back screen-only" onMouseDown={onClose}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <h3>貼上到對照欄{col ? `（${col.lang}）` : ''} <HelpLink topic="refcols" /></h3>
        {col?.mode !== 'verse' && (
        <div className="modes">
          <label><input type="radio" checked={mode === 'cells'} onChange={() => setMode('cells')} /> 逐格貼上（從目前這一格開始依序往下填）</label>
          <label><input type="radio" checked={mode === 'verse'} onChange={() => setMode('verse')} /> 依經節對齊（依經節號切開，放到包含這一節的第一行）</label>
        </div>
        )}
        {col?.mode === 'verse' && <p className="hint">這是整節對照欄：依貼上文字裡的經節號，把每一節的譯文放進對應的經節。</p>}

        {plan.error && <p className="errs">{plan.error}</p>}

        {!plan.error && (
          <>
            <table className="pv">
              <thead>
                <tr><th>{plan.byVerse ? '經節' : '行'}</th><th>分析欄</th><th>要貼上的文字</th><th>原有內容</th></tr>
              </thead>
              <tbody>
                {plan.targets.map((t) => (
                  <tr key={t.key} className={t.existing ? 'has' : undefined}>
                    <td>{plan.byVerse ? (t.verses ?? [t.key]).join('、') : order.indexOf(t.key) + 1}{!plan.byVerse && t.verses ? <small>（{t.verses.join('、')}）</small> : null}</td>
                    <td>{clip(t.rowText)}</td>
                    <td>{clip(t.text, 28)}</td>
                    <td>
                      {t.existing ? (
                        <>
                          <span className="old">{clip(t.existing)}</span>
                          <select value={perCell[t.key] ?? defExisting} onChange={(e) => setPerCell({ ...perCell, [t.key]: e.target.value as ExistingPolicy })}>
                            <option value="overwrite">覆蓋</option>
                            <option value="append">接在後面</option>
                            <option value="skip">略過</option>
                          </select>
                        </>
                      ) : (
                        <span className="hint">（空）</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {withExisting.length > 0 && (
              <p>
                <b>{withExisting.length} 格已經有內容</b>，全部：
                <select value={defExisting} onChange={(e) => { setDefExisting(e.target.value as ExistingPolicy); setPerCell({}); }}>
                  <option value="overwrite">覆蓋</option>
                  <option value="append">接在後面</option>
                  <option value="skip">略過</option>
                </select>
              </p>
            )}
            {plan.leftovers.length > 0 && (
              <div className="leftover">
                <b>{mode === 'verse' ? '找不到對應行的內容' : '超出最後一行的文字'}（{plan.leftovers.length}）</b>
                <ul>{plan.leftovers.map((l, i) => <li key={i}>{l.label}：{clip(l.text, 36)}</li>)}</ul>
                <label><input type="radio" checked={leftover === 'merge-last'} onChange={() => setLeftover('merge-last')} /> 併入最後一行</label>{' '}
                <label><input type="radio" checked={leftover === 'cancel'} onChange={() => setLeftover('cancel')} /> 取消貼上</label>
              </div>
            )}
          </>
        )}
        {cannot && !plan.error && <p className="errs">{cannot}</p>}
        <div className="modal-buttons">
          <button
            className="primary"
            disabled={!!cannot}
            onClick={() => {
              if (!resolved) return;
              onClose();
              onApply(resolved, `已貼上到 ${resolved.length} 格對照欄`);
            }}
          >
            貼上
          </button>
          <button onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
