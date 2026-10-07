import type { Seg } from './types';

// §7.4 經節自動辨識（只在貼上時進行）。純函式。
//
// 候選位置只有三種：行首的數字、數字後面緊接著文字（「16For」「16神」）、「章:節」。
// 候選必須形成連續遞增的節號才會採用（至少 2 個）；其他數字保留成一般文字。

interface Cand {
  line: number;
  start: number;
  end: number; // 要被標記取代的範圍（不含）
  v: number;
  c?: number; // 明寫的章
}

export interface DetectResult {
  lines: Seg[][];
  /** 辨識出幾個經節 */
  count: number;
}

const text = (t: string): Seg => ({ t: 'text', text: t, marks: [] });

function candidates(lines: string[]): Cand[] {
  const out: Cand[] = [];
  lines.forEach((ln, li) => {
    const seen = new Set<number>();
    const add = (c: Cand) => {
      if (c.v < 1 || c.v > 176 || seen.has(c.start)) return;
      seen.add(c.start);
      out.push(c);
    };
    // 章:節（任何位置）
    for (const m of ln.matchAll(/(?<![\d:])(\d{1,3}):(\d{1,3})(?![\d:])[ \t]?/g))
      add({ line: li, start: m.index!, end: m.index! + m[0].length, c: Number(m[1]), v: Number(m[2]) });
    // 行首的數字
    const h = /^(\s*)(\d{1,3})(?![\d:])[ \t]?/.exec(ln);
    if (h) add({ line: li, start: h[1].length, end: h[0].length, v: Number(h[2]) });
    // 數字後面緊接著文字（任何位置）
    for (const m of ln.matchAll(/(?<![\d:])(\d{1,3})(?=\p{L})/gu))
      add({ line: li, start: m.index!, end: m.index! + m[1].length, v: Number(m[1]) });
  });
  return out.sort((a, b) => a.line - b.line || a.start - b.start);
}

export function detectVerses(lines: string[], startChapter: number): DetectResult {
  const cs = candidates(lines);
  // 每個候選：以它結尾的最長連續鏈
  const best: { len: number; prev: number; ch: number }[] = [];
  cs.forEach((c, i) => {
    let b = { len: 1, prev: -1, ch: c.c ?? startChapter };
    for (let j = 0; j < i; j++) {
      const p = cs[j];
      if (p.line === c.line && p.end > c.start) continue; // 重疊
      const pj = best[j];
      let ch: number | null = null;
      if (c.v === p.v + 1 && (c.c === undefined || c.c === pj.ch)) ch = pj.ch;
      else if (c.v === 1 && p.v >= 2 && (c.c === undefined || c.c === pj.ch + 1)) ch = pj.ch + 1; // 節號跳回 1：章 +1
      if (ch !== null && pj.len + 1 > b.len) b = { len: pj.len + 1, prev: j, ch };
    }
    best.push(b);
  });
  let top = -1;
  best.forEach((b, i) => {
    if (top < 0 || b.len > best[top].len) top = i;
  });
  if (top < 0 || best[top].len < 2) return { lines: lines.map((l) => (l === '' ? [] : [text(l)])), count: 0 };

  const chosen = new Map<number, { c: Cand; ch: number }[]>();
  for (let i = top; i >= 0; i = best[i].prev) {
    const arr = chosen.get(cs[i].line) ?? [];
    arr.unshift({ c: cs[i], ch: best[i].ch });
    chosen.set(cs[i].line, arr);
  }
  const out = lines.map((ln, li): Seg[] => {
    const picks = chosen.get(li) ?? [];
    const segs: Seg[] = [];
    let pos = 0;
    for (const { c, ch } of picks) {
      if (c.start > pos) segs.push(text(ln.slice(pos, c.start)));
      segs.push({ t: 'verse', c: ch, v: c.v, shown: true });
      pos = c.end;
    }
    if (pos < ln.length) segs.push(text(ln.slice(pos)));
    return segs;
  });
  return { lines: out, count: best[top].len };
}

/** 不做辨識：每行一個文字片段。 */
export function plainLines(lines: string[]): Seg[][] {
  return lines.map((l) => (l === '' ? [] : [text(l)]));
}
