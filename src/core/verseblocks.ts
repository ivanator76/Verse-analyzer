import { rowsInOrder } from './tree';
import type { Doc } from './types';
import { versesByRow } from './verses';

// §8 整節對照：一節的譯文跨越分析欄中這一節涵蓋的所有行。
// 一行包含好幾節時，這幾節的譯文依序放在同一個區塊裡。

export interface VerseBlock {
  /** 區塊涵蓋的列（閱讀順序的索引，含頭尾） */
  start: number;
  end: number;
  /** 區塊裡的經節（「章:節」），依閱讀順序 */
  keys: string[];
}

export function verseBlocks(doc: Doc): VerseBlock[] {
  const rows = rowsInOrder(doc);
  const by = versesByRow(doc);
  const span = new Map<string, [number, number]>();
  const order: string[] = [];
  rows.forEach((r, i) => {
    for (const k of by.get(r.id)!) {
      const sp = span.get(k);
      if (!sp) (span.set(k, [i, i]), order.push(k));
      else sp[1] = i;
    }
  });
  const blocks: VerseBlock[] = [];
  for (const k of order) {
    const [f, l] = span.get(k)!;
    const cur = blocks[blocks.length - 1];
    if (cur && f <= cur.end) {
      cur.end = Math.max(cur.end, l);
      cur.keys.push(k);
    } else blocks.push({ start: f, end: l, keys: [k] });
  }
  return blocks;
}

/** 文件裡出現的經節（閱讀順序、不重複）。 */
export const verseKeys = (doc: Doc): string[] => verseBlocks(doc).flatMap((b) => b.keys);
