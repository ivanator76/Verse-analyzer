import { useState } from 'react';
import { HelpLink } from './HelpLink';
import type { Settings } from '../core/types';
import { validateSettings } from '../core/validate';

const LANGS: [string, string][] = [
  ['grc', '希臘文'],
  ['en', '英文'],
  ['zh-Hant', '繁體中文'],
];

const MARGIN_NAMES = ['上', '右', '下', '左'];

// 元件要定義在外面：定義在對話框裡面的話，每次按鍵重新繪製都會變成新的元件，輸入框會失去焦點。
function Num({ value, onChange, w = 64, step = 1 }: { value: number; onChange(v: number): void; w?: number; step?: number }) {
  return (
    <input
      type="number"
      step={step}
      style={{ width: w }}
      value={Number.isNaN(value) ? '' : value}
      onChange={(e) => onChange(e.target.value.trim() === '' ? NaN : Number(e.target.value))}
    />
  );
}

/** 版面設定（§9.4、§11「欄位」選單）。按「套用」才算一個復原步驟。 */
export function LayoutSettings({
  init,
  onApply,
  onClose,
  title = '版面設定',
  hideRefColumns = false,
  onSwap,
}: {
  init: Settings;
  onApply(s: Settings): void;
  onClose(): void;
  title?: string;
  hideRefColumns?: boolean;
  /** 「與分析欄交換」（§8.1）：只對已經存在的逐行對照欄；會關閉這個對話框 */
  onSwap?(colId: string): void;
}) {
  const [s, setS] = useState<Settings>(() => structuredClone(init));
  const errs = validateSettings(s);
  const changed = JSON.stringify(s) !== JSON.stringify(init);
  const set = (fn: (d: Settings) => void) =>
    setS((cur) => {
      const d = structuredClone(cur);
      fn(d);
      return d;
    });
  return (
    <div className="modal-back screen-only" onMouseDown={onClose}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{title} <HelpLink topic="layout" /></h3>
        <div className="grid">
          <label>頁面方向</label>
          <select value={s.page.orientation} onChange={(e) => set((d) => (d.page.orientation = e.target.value as 'portrait' | 'landscape'))}>
            <option value="portrait">直向</option>
            <option value="landscape">橫向</option>
          </select>

          <label>邊界（mm）</label>
          <span>
            {s.page.margins.map((m, i) => (
              <span key={i} style={{ marginRight: 8 }}>
                {MARGIN_NAMES[i]} <Num value={m} w={52} onChange={(v) => set((d) => (d.page.margins[i] = v))} />
              </span>
            ))}
          </span>

          <label>分析欄語言</label>
          <select value={s.main.lang} onChange={(e) => set((d) => (d.main.lang = e.target.value))}>
            {LANGS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>

          <label>字級（pt）</label>
          <Num value={s.main.size} step={0.5} onChange={(v) => set((d) => (d.main.size = v))} />

          <label>每階縮排（mm）</label>
          <Num value={s.indentStep} step={0.1} onChange={(v) => set((d) => (d.indentStep = v))} />

          <label>樹狀區左邊留白（mm）</label>
          <Num value={s.treePadLeft ?? 0} onChange={(v) => set((d) => (d.treePadLeft = v))} />

          <label title="影響列印尺寸；和視窗右上角的「檢視縮放」不同">版面縮放（%）</label>
          <span>
            <Num value={Math.round(s.layoutScale * 1000) / 10} onChange={(v) => set((d) => (d.layoutScale = v / 100))} />
            <span className="hint"> 會改變列印出來的大小；只想放大螢幕上的畫面請用「檢視縮放」</span>
          </span>

          <label>多個關係的標記分隔符</label>
          <input style={{ width: 48 }} value={s.labelSeparator} onChange={(e) => set((d) => (d.labelSeparator = e.target.value))} />

          <label>主句標記一律加 *</label>
          <input type="checkbox" checked={s.showMainAsterisk} onChange={(e) => set((d) => (d.showMainAsterisk = e.target.checked))} />
        </div>

        {!hideRefColumns && (<>
        <h4>對照欄</h4>
        {s.refColumns.length === 0 && <p className="hint">目前沒有對照欄。</p>}
        {s.refColumns.map((c, i) => (
          <div key={c.id} className="refrow">
            <input type="checkbox" checked={c.visible} title="顯示" onChange={(e) => set((d) => (d.refColumns[i].visible = e.target.checked))} />
            欄 {i + 1}
            <select value={c.lang} onChange={(e) => set((d) => (d.refColumns[i].lang = e.target.value))}>
              {LANGS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
            <select value={c.mode} title="逐行：每一行各有一格；整節：一節的譯文跨越這一節涵蓋的所有行。切換時兩種模式的內容都會保留。" onChange={(e) => set((d) => (d.refColumns[i].mode = e.target.value as 'row' | 'verse'))}>
              <option value="row">逐行</option>
              <option value="verse">整節</option>
            </select>
            寬度 <Num value={Math.round(c.width * 100)} w={52} onChange={(v) => set((d) => (d.refColumns[i].width = v / 100))} />%
            {onSwap && init.refColumns.some((x) => x.id === c.id) && (
              <button
                disabled={changed || c.mode !== 'row'}
                title={c.mode !== 'row' ? '整節對照欄不能交換，請先改成逐行' : changed ? '請先按「套用」（或取消）目前的修改' : '把這一欄和分析欄的文字、語言對調'}
                onClick={() => (onClose(), onSwap(c.id))}
              >
                與分析欄交換…
              </button>
            )}
            <button onClick={() => set((d) => d.refColumns.splice(i, 1))}>移除</button>
          </div>
        ))}
        <button
          disabled={s.refColumns.length >= 2}
          onClick={() =>
            set((d) => {
              const used = new Set(d.refColumns.map((c) => c.id));
              const id = ['c1', 'c2', 'c3'].find((x) => !used.has(x))!;
              d.refColumns.push({ id, lang: 'en', visible: true, width: 0.25, mode: 'row' });
            })
          }
        >
          新增對照欄（最多 2 個）
        </button>
        </>)}

        {errs.length > 0 && <ul className="errs">{errs.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <div className="modal-buttons">
          <button className="primary" disabled={errs.length > 0} onClick={() => (onClose(), onApply(s))}>套用</button>
          <button onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
