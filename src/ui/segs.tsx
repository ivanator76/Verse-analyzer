import type { ReactNode } from 'react';
import type { Seg } from '../core/types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 量測用的 HTML 字串版本；要和下面的 React 版本排出同樣的版面。 */
export function renderSegsHtml(segs: Seg[]): string {
  return segs
    .map((s) => {
      if (s.t === 'verse') return `<sup class="verse${s.shown ? '' : ' hid'}">${s.v}</sup>`;
      let h = esc(s.text);
      for (const m of s.marks) {
        if (m.k === 'b') h = `<b>${h}</b>`;
        else if (m.k === 'i') h = `<i>${h}</i>`;
        else if (m.k === 'u') h = `<u>${h}</u>`;
        else if (m.k === 'sup') h = `<sup>${h}</sup>`;
        else if (m.k === 'hl') h = `<span style="background:${m.color}">${h}</span>`;
        else h = `<span style="color:${m.color}">${h}</span>`;
      }
      return h;
    })
    .join('');
}

export function Segs({ segs }: { segs: Seg[] }) {
  return <span dangerouslySetInnerHTML={{ __html: renderSegsHtml(segs) }} />;
}

export type { ReactNode };
