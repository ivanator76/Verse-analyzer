import { useState } from 'react';
import { HelpLink } from './HelpLink';
import { LIMITS, validatePrefs, type Prefs } from '../core/prefs';

// 元件要定義在外面：定義在對話框裡面的話，每次按鍵重新繪製都會變成新的元件，輸入框會失去焦點。
function Num({ v, set, w = 70 }: { v: number; set(n: number): void; w?: number }) {
  return <input type="number" style={{ width: w }} value={Number.isNaN(v) ? '' : v} onChange={(e) => set(e.target.value === '' ? NaN : Number(e.target.value))} />;
}

/** 偏好設定：和文件分開存的 app 設定。按「套用」才存檔。 */
export function PrefsDialog({
  init,
  onApply,
  onReset,
  onEditDefaults,
  onEditRelations,
  onClose,
}: {
  init: Prefs;
  onApply(p: Partial<Prefs>): void;
  onReset(): void;
  onEditDefaults(): void;
  onEditRelations(): void;
  onClose(): void;
}) {
  const [zoom, setZoom] = useState(Math.round(init.viewZoom * 100));
  const [auto, setAuto] = useState(init.autosaveSeconds);
  const [keep, setKeep] = useState(init.backupKeep);
  const draft: Prefs = { ...init, viewZoom: zoom / 100, autosaveSeconds: auto, backupKeep: keep };
  const errs = validatePrefs(draft).filter((e) => /檢視縮放|自動存檔|備份/.test(e));

  return (
    <div className="modal-back screen-only" onMouseDown={onClose}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <h3>偏好設定 <HelpLink topic="prefs" /></h3>
        <p className="hint">這些設定屬於 app，不會存進文件，也不影響已經存在的文件。</p>
        <div className="grid">
          <label>檢視縮放（%）</label>
          <span>
            <Num v={zoom} set={setZoom} />
            <span className="hint"> 只影響螢幕上看起來的大小；列印大小請用文件的「版面縮放」</span>
          </span>

          <label>自動存檔間隔（秒）</label>
          <span>
            <Num v={auto} set={setAuto} />
            <span className="hint"> 有未存的變更時，每隔這麼久寫一份復原檔（{LIMITS.autosaveSeconds[0]}–{LIMITS.autosaveSeconds[1]}）</span>
          </span>

          <label>備份保留版數</label>
          <span>
            <Num v={keep} set={setKeep} />
            <span className="hint"> 每個檔案保留最近幾版（{LIMITS.backupKeep[0]}–{LIMITS.backupKeep[1]}）；變小時，下次存檔才會清掉多的</span>
          </span>

          <label>新文件的預設版面</label>
          <span><button onClick={onEditDefaults}>編輯…</button> <span className="hint">方向、邊界、字級、縮排、版面縮放等</span></span>

          <label>關係表（全域預設）</label>
          <span><button onClick={onEditRelations}>編輯…</button> <span className="hint">{init.relationTypes ? '已自訂' : '內建預設'}</span></span>
        </div>
        {errs.length > 0 && <ul className="errs">{errs.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <div className="modal-buttons">
          <button onClick={() => confirm('把所有偏好設定（包含關係表和新文件的預設版面）還原成預設？已經存在的文件不受影響。') && (onClose(), onReset())}>還原全部預設</button>
          <button className="primary" disabled={errs.length > 0} onClick={() => (onClose(), onApply({ viewZoom: zoom / 100, autosaveSeconds: auto, backupKeep: Math.round(keep) }))}>套用</button>
          <button onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
