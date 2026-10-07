import { useState } from 'react';
import { HelpLink } from './HelpLink';
import { k } from './keys';
import type { Result } from '../core/commands';
import * as C from '../core/commands';
import { findType, labelText } from '../core/relations';
import { firstRow, segsText } from '../core/tree';
import type { Bracket, Doc } from '../core/types';

/** §11 右側面板：選取括號時出現。所有按鈕都是一個指令（一個復原步驟）。 */
export function RelationPanel({ doc, bracket, run, onClose }: { doc: Doc; bracket: Bracket; run(r: Result): void; onClose(): void }) {
  const [q, setQ] = useState('');
  const types = doc.relationTypes.filter((t) => t.name.includes(q) || t.minor.includes(q) || t.main.includes(q));
  const preview = (c: Bracket['children'][number]) => {
    const t = segsText(firstRow(c.item).main).trim();
    return (c.item.kind === 'bracket' ? '［括號］' : '') + (t.length > 14 ? t.slice(0, 14) + '…' : t);
  };

  return (
    <aside className="panel screen-only">
      <div className="panel-head">
        <h4>括號關係 <HelpLink topic="relations" /></h4>
        <button className="primary" onClick={onClose} title="Esc">完成</button>
      </div>
      <p className="hint">每個修改按下去就已經套用，可以用 {k('⌘Z')} 復原。設定好了按「完成」關閉這個面板。</p>
      <section>
        <b>加入關係</b>
        <input placeholder="打字篩選…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          {types.map((t) => (
            <button key={t.id} onClick={() => run(C.addRelation(doc, bracket.id, t.id))} title={`次要「${t.minor || '空白'}」／主句「${t.main || '*'}」`}>
              {t.name}
            </button>
          ))}
        </div>
      </section>

      {bracket.relations.length === 0 && <p className="hint">尚未指定關係</p>}
      {bracket.relations.map((r, ri) => {
        const type = findType(doc.relationTypes, r.type)!;
        const move = (d: -1 | 1) => {
          const order = bracket.relations.map((x) => x.id);
          [order[ri], order[ri + d]] = [order[ri + d], order[ri]];
          run(C.reorderRelations(doc, bracket.id, order));
        };
        return (
          <section key={r.id} className="rel">
            <div className="relhead">
              <select value={r.type} onChange={(e) => run(C.replaceRelation(doc, bracket.id, r.id, e.target.value))}>
                {doc.relationTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button disabled={ri === 0} onClick={() => move(-1)}>↑</button>
              <button disabled={ri === bracket.relations.length - 1} onClick={() => move(1)}>↓</button>
              <button onClick={() => run(C.removeRelation(doc, bracket.id, r.id))}>移除</button>
            </div>
            {bracket.children.length === 2 && type.hasMain !== 'no' && (
              <button onClick={() => run(C.swapMain(doc, bracket.id, r.id))}>交換主次</button>
            )}
            <table>
              <tbody>
                {bracket.children.map((c) => {
                  const lab = c.labels[r.id];
                  const shown = labelText(type, lab, { ...doc.settings, showMainAsterisk: false });
                  return (
                    <tr key={c.item.id} className={lab.pending ? 'pending' : undefined}>
                      <td className="pv">{preview(c)}</td>
                      <td>
                        {type.hasMain !== 'no' && (
                          <label title="設為主句">
                            <input type="radio" checked={lab.main} onChange={() => run(C.setMain(doc, bracket.id, r.id, c.item.id))} />主
                          </label>
                        )}
                      </td>
                      <td>
                        <input
                          key={`${lab.text}|${lab.main}|${lab.pending}`}
                          className="labin"
                          defaultValue={lab.pending ? '' : shown}
                          placeholder={lab.pending ? '待判定' : ''}
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (v !== shown) run(C.setLabelText(doc, bracket.id, r.id, c.item.id, v));
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        />
                        {lab.text !== null && <button title="恢復預設" onClick={() => run(C.setLabelText(doc, bracket.id, r.id, c.item.id, null))}>↺</button>}
                        {!lab.pending && <button title="標為待判定" onClick={() => run(C.setLabelPending(doc, bracket.id, r.id, c.item.id, true))}>?</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </aside>
  );
}
