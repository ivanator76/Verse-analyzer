import { findIncomplete } from './commands';
import type { Layout } from './layout';
import type { Doc } from './types';

// §9.5 匯出前檢查。

export interface Issue {
  kind: 'tooTall' | 'fonts' | 'unassigned' | 'pending' | 'missingMain' | 'narrow';
  text: string;
  /** 點清單項目時要跳到的位置 */
  target?: { rowId?: string; bracketId?: string };
}

export interface Preflight {
  /** 必須修正才能輸出 */
  blocking: Issue[];
  /** 可以選「仍要輸出」 */
  soft: Issue[];
}

export function preflight(doc: Doc, layout: Layout | null, fontsReady: boolean): Preflight {
  const blocking: Issue[] = [];
  const soft: Issue[] = [];
  if (!fontsReady || !layout) {
    blocking.push({ kind: 'fonts', text: '字型尚未載入完成，請稍候再輸出' });
    return { blocking, soft };
  }
  for (const id of layout.warnings.tooTall)
    blocking.push({
      kind: 'tooTall',
      text: '整節對照的譯文比一頁還高，或被手動分頁點切開（可以縮短譯文、改成橫向、縮小字級、調整版面縮放，或拿掉區塊中間的手動分頁點）',
      target: { rowId: id },
    });
  const inc = findIncomplete(doc);
  for (const id of inc.unassignedBrackets) soft.push({ kind: 'unassigned', text: '括號還沒有指定關係', target: { bracketId: id } });
  for (const p of inc.pendingLabels) soft.push({ kind: 'pending', text: '有待判定的標記', target: { bracketId: p.bracketId } });
  for (const m of inc.missingMain) soft.push({ kind: 'missingMain', text: '關係缺主句', target: { bracketId: m.bracketId } });
  if (layout.warnings.narrow) soft.push({ kind: 'narrow', text: '版面過窄：分析欄扣掉縮排後少於 40mm' });
  return { blocking, soft };
}
