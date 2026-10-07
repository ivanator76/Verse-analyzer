import type { Measurer } from '../core/layout';
import type { Doc, Seg } from '../core/types';
import { fontStackForLang } from '../core/fonts';
import { renderSegsHtml } from './segs';

export const PX_PER_MM = 96 / 25.4;
const PT_MM = 25.4 / 72;
export const LINE_HEIGHT = 15 / 11; // 參考 PDF 的行距 15pt
export const LABEL_PT = 7;

/** 標題與標記用的字型（中文、希臘文都能顯示）。 */
export function fontStack(doc: Doc): string {
  return fontStackForLang(doc.settings.main.lang, doc.settings.main.font);
}

/** 某一欄文字用的字型：分析欄（'main'）或對照欄 id，各依自己的語言（§8.1）。 */
export function cellFont(doc: Doc, col: string): string {
  const lang = col === 'main' ? doc.settings.main.lang : (doc.settings.refColumns.find((c) => c.id === col)?.lang ?? doc.settings.main.lang);
  return fontStackForLang(lang, doc.settings.main.font);
}

/** 用隱藏的 DOM 量測，結果和畫面、PDF 共用同一套字型與排法。 */
export function domMeasurer(doc: Doc): Measurer & { dispose(): void } {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;';
  document.body.appendChild(host);
  const fontMm = doc.settings.main.size * PT_MM;
  const lineMm = fontMm * LINE_HEIGHT;

  const cell = (segs: Seg[], widthMm: number, col: string) => {
    const el = document.createElement('div');
    el.className = 'cell';
    el.style.cssText = `width:${widthMm}mm;font-family:${cellFont(doc, col)};font-size:${doc.settings.main.size}pt;line-height:${LINE_HEIGHT};`;
    el.innerHTML = renderSegsHtml(segs) || '&nbsp;';
    host.appendChild(el);
    const h = el.getBoundingClientRect().height / PX_PER_MM;
    host.removeChild(el);
    return h;
  };

  const lab = document.createElement('span');
  lab.style.cssText = `font-family:${fontStack(doc)};font-size:${LABEL_PT}pt;white-space:nowrap;`;
  host.appendChild(lab);

  return {
    lineH: lineMm,
    labelHeight: LABEL_PT * PT_MM * 1.0,
    labelWidth(text, bold) {
      lab.style.fontWeight = bold ? '700' : '400';
      lab.textContent = text;
      return lab.getBoundingClientRect().width / PX_PER_MM;
    },
    measureVerses(items, width, colId) {
      // 結構要和畫面上的編輯器一樣：.cell > .ProseMirror > p，節號用 CSS 變數 --vtag 畫在段落前面
      let total = 0;
      for (const { tag, segs } of items) {
        const el = document.createElement('div');
        el.className = 'cell vcell';
        el.style.cssText = `width:${width}mm;font-family:${cellFont(doc, colId ?? 'main')};font-size:${doc.settings.main.size}pt;line-height:${LINE_HEIGHT};--vtag:"${tag}";`;
        el.innerHTML = `<div class="ProseMirror"><p>${renderSegsHtml(segs) || '&nbsp;'}</p></div>`;
        host.appendChild(el);
        total += Math.max(el.getBoundingClientRect().height / PX_PER_MM, lineMm);
        host.removeChild(el);
      }
      return total;
    },
    measureRow(row, analysisWidth, refWidths) {
      let h = cell(row.main, analysisWidth, 'main');
      for (const [k, w] of Object.entries(refWidths)) h = Math.max(h, cell(row.refs[k] ?? [], w, k));
      return { h: Math.max(h, lineMm), firstLineMid: lineMm / 2 + 0.6 };
    },
    dispose() {
      host.remove();
    },
  };
}
