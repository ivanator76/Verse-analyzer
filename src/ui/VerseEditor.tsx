import { useState } from 'react';

/** §7.4：點一下經節標記 → 改成一般文字，或修改章、節。 */
export function VerseEditor({
  init,
  onApply,
  onToText,
  onDelete,
  onClose,
}: {
  init: { c: number; v: number; shown: boolean };
  onApply(c: number, v: number, shown: boolean): void;
  onToText(): void;
  onDelete(): void;
  onClose(): void;
}) {
  const [c, setC] = useState(String(init.c));
  const [v, setV] = useState(String(init.v));
  const [shown, setShown] = useState(init.shown);
  const ci = Number(c);
  const vi = Number(v);
  const valid = Number.isInteger(ci) && ci >= 1 && Number.isInteger(vi) && vi >= 1;
  return (
    <div className="modal-back screen-only" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>經節標記</h3>
        <p style={{ fontSize: 13 }}>
          章 <input style={{ width: 56 }} value={c} onChange={(e) => setC(e.target.value)} /> 節{' '}
          <input style={{ width: 56 }} value={v} onChange={(e) => setV(e.target.value)} autoFocus />
        </p>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={shown} onChange={(e) => setShown(e.target.checked)} /> 在頁面上顯示節號（取消＝隱藏的歸屬錨點，不列印）
        </label>
        <div className="modal-buttons">
          <button onClick={() => (onClose(), onToText())}>改成一般文字</button>
          <button onClick={() => (onClose(), onDelete())}>刪除標記</button>
          <button className="primary" disabled={!valid} onClick={() => (onClose(), onApply(ci, vi, shown))}>套用</button>
          <button onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
