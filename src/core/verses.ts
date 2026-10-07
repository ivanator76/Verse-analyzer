import { normalizeSegs, rowsInOrder } from './tree';
import type { Doc, Row, VerseSeg } from './types';

// §7：經節歸屬與隱藏錨點。

export interface VerseRef {
  c: number;
  v: number;
}

const same = (a: VerseRef | null, b: VerseRef | null) =>
  a === b || (!!a && !!b && a.c === b.c && a.v === b.v);

/** 每一行的「起始經節」：該行第一個字元所屬的經節（§7.2）。 */
export function startVerses(doc: Doc): Map<string, VerseRef | null> {
  const out = new Map<string, VerseRef | null>();
  let cur: VerseRef | null = null;
  for (const r of rowsInOrder(doc)) {
    const first = r.main[0];
    out.set(r.id, first && first.t === 'verse' ? { c: first.c, v: first.v } : cur);
    for (const s of r.main) if (s.t === 'verse') cur = { c: s.c, v: s.v };
  }
  return out;
}

/** 每一行、每個非空文字片段所屬的經節。測試「歸屬不變」用。 */
export function textAttribution(doc: Doc): Map<string, (VerseRef | null)[]> {
  const out = new Map<string, (VerseRef | null)[]>();
  let cur: VerseRef | null = null;
  for (const r of rowsInOrder(doc)) {
    const list: (VerseRef | null)[] = [];
    for (const s of r.main) {
      if (s.t === 'verse') cur = { c: s.c, v: s.v };
      else if (s.text !== '') list.push(cur);
    }
    out.set(r.id, list);
  }
  return out;
}

export function sameAttribution(
  a: Map<string, (VerseRef | null)[]>,
  b: Map<string, (VerseRef | null)[]>,
  ids: Iterable<string>,
): boolean {
  for (const id of ids) {
    const x = a.get(id);
    const y = b.get(id);
    if (!x || !y || x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!same(x[i], y[i])) return false;
  }
  return true;
}

/**
 * 操作後修正歸屬：起始經節和操作前不同的行，在行首補一個隱藏錨點（§7.3）。
 * `before` 是操作前的 startVerses。就地修改 draft。
 */
export function restoreAnchors(doc: Doc, before: Map<string, VerseRef | null>): void {
  const now = startVerses(doc);
  for (const r of rowsInOrder(doc)) {
    if (!before.has(r.id)) continue;
    const want = before.get(r.id) ?? null;
    if (want && !same(want, now.get(r.id) ?? null)) {
      const anchor: VerseSeg = { t: 'verse', c: want.c, v: want.v, shown: false };
      r.main = [anchor, ...r.main];
      // 補了錨點會改變後面的行，所以逐行重新計算
      return restoreAnchors(doc, before);
    }
  }
}

/** 刪掉拿掉之後歸屬也不會改變的隱藏錨點。就地修改。 */
export function pruneAnchors(doc: Doc): void {
  const base = textAttribution(doc);
  const starts = startVerses(doc);
  for (const r of rowsInOrder(doc)) {
    for (let i = r.main.length - 1; i >= 0; i--) {
      const s = r.main[i];
      if (s.t !== 'verse' || s.shown) continue;
      const saved = r.main;
      r.main = normalizeSegs([...saved.slice(0, i), ...saved.slice(i + 1)]);
      const ok =
        sameAttribution(base, textAttribution(doc), base.keys()) && sameStarts(starts, startVerses(doc));
      if (!ok) r.main = saved;
    }
  }
}

function sameStarts(a: Map<string, VerseRef | null>, b: Map<string, VerseRef | null>) {
  for (const [id, v] of a) if (!same(v, b.get(id) ?? null)) return false;
  return true;
}

export function rowVerseSpan(row: Row): VerseRef[] {
  return row.main.filter((s): s is VerseSeg => s.t === 'verse').map((s) => ({ c: s.c, v: s.v }));
}


/** 閱讀順序上，指定行的指定位置（內容位移，經節標記算 1）之前最後出現的經節標記。 */
export function verseBefore(doc: Doc, rowId: string, offset: number): VerseRef | null {
  let cur: VerseRef | null = null;
  for (const r of rowsInOrder(doc)) {
    let acc = 0;
    for (const s of r.main) {
      if (r.id === rowId && acc >= offset) return cur;
      if (s.t === 'verse') cur = { c: s.c, v: s.v };
      acc += s.t === 'verse' ? 1 : s.text.length;
    }
    if (r.id === rowId) return cur;
  }
  return cur;
}

/** 一行「包含」的經節（§7.2）：起始經節，加上行裡所有的經節標記。鍵是「章:節」。 */
export function versesByRow(doc: Doc): Map<string, string[]> {
  const starts = startVerses(doc);
  const out = new Map<string, string[]>();
  for (const r of rowsInOrder(doc)) {
    const set: string[] = [];
    const add = (c: number, v: number) => set.includes(`${c}:${v}`) || set.push(`${c}:${v}`);
    const s = starts.get(r.id);
    if (s) add(s.c, s.v);
    for (const seg of r.main) if (seg.t === 'verse') add(seg.c, seg.v);
    out.set(r.id, set);
  }
  return out;
}
