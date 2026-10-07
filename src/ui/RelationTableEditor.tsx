import { useState } from 'react';
import { HelpLink } from './HelpLink';
import { DEFAULT_RELATION_TYPES, newTypeId, validateRelationTypes } from '../core/relations';
import type { MainRule, RelationType } from '../core/types';
import { resetRelationTypes, setRelationTypes } from './prefs';

const MAIN_LABEL: Record<MainRule, string> = { yes: '有', no: '無（所有分支同等）', optional: '可以指定' };

/**
 * 全域關係表編輯器。新文件會複製一份到檔案裡，所以這裡的修改不會影響已經存在的文件；
 * 想讓目前這份文件也用新增的關係，按「加入目前文件」（只加入沒有的，不改動已有的）。
 */
export function RelationTableEditor({
  init,
  docMissing,
  onMergeToDoc,
  onClose,
}: {
  init: RelationType[];
  /** 目前文件還沒有的關係數（以全域表的目前儲存內容計） */
  docMissing(types: RelationType[]): number;
  onMergeToDoc(types: RelationType[]): void;
  onClose(): void;
}) {
  const [rows, setRows] = useState<RelationType[]>(() => structuredClone(init));
  const [saved, setSaved] = useState(false);
  const errs = validateRelationTypes(rows);
  const edit = (i: number, patch: Partial<RelationType>) => {
    setSaved(false);
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };
  const move = (i: number, d: -1 | 1) => {
    setSaved(false);
    setRows((r) => {
      const n = [...r];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
  };
  const save = () => {
    setRelationTypes(rows);
    setSaved(true);
  };

  return (
    <div className="modal-back screen-only" onMouseDown={onClose}>
      <div className="modal wide reltable" onMouseDown={(e) => e.stopPropagation()}>
        <h3>關係表（全域預設） <HelpLink topic="prefs" /></h3>
        <p className="hint">新文件會複製一份這個表到檔案裡；已經存在的文件不受影響，永遠顯示得和當初一樣。</p>
        <table>
          <thead>
            <tr><th /><th>名稱</th><th>次要句標記</th><th>主句標記</th><th>主句</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.id}>
                <td className="mv">
                  <button disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</button>
                </td>
                <td><input value={t.name} onChange={(e) => edit(i, { name: e.target.value })} /></td>
                <td><input className="mk" value={t.minor} placeholder="（空白）" onChange={(e) => edit(i, { minor: e.target.value })} /></td>
                <td>
                  <input className="mk" value={t.main} placeholder="＊" disabled={t.hasMain === 'no'} onChange={(e) => edit(i, { main: e.target.value })} />
                </td>
                <td>
                  <select value={t.hasMain} onChange={(e) => edit(i, { hasMain: e.target.value as MainRule })}>
                    {(Object.keys(MAIN_LABEL) as MainRule[]).map((k) => <option key={k} value={k}>{MAIN_LABEL[k]}</option>)}
                  </select>
                </td>
                <td><button title="從全域表刪除（不影響已有的文件）" onClick={() => { setSaved(false); setRows((r) => r.filter((_, j) => j !== i)); }}>刪除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => { setSaved(false); setRows((r) => [...r, { id: newTypeId(r), name: '', minor: '', main: '', hasMain: 'yes' }]); }}>新增關係</button>
        <button onClick={() => { if (confirm('還原成內建的關係表？（你自訂的關係會從全域表移除）')) { setRows(structuredClone(DEFAULT_RELATION_TYPES)); setSaved(false); } }}>還原內建預設</button>

        {errs.length > 0 && <ul className="errs">{errs.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <div className="modal-buttons">
          {saved && <span className="hint">已儲存；之後新建的文件會用這份。</span>}
          <button disabled={errs.length > 0 || docMissing(rows) === 0} title="只加入目前文件沒有的關係，不會改動已有的" onClick={() => { save(); onMergeToDoc(rows); }}>
            儲存並加入目前文件（{docMissing(rows)}）
          </button>
          <button className="primary" disabled={errs.length > 0} onClick={save}>儲存</button>
          <button onClick={onClose}>關閉</button>
        </div>
      </div>
    </div>
  );
}

export { resetRelationTypes };
