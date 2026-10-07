import { locate } from './tree';
import type { Doc, Item } from './types';

// 拖曳時，指標停在某一行的上緣或下緣，可以放的位置不只一個：
// 放在那一行本身旁邊，或放在包著它的括號旁邊（只要那一行是括號的第一個／最後一個子項）。
// 由內往外列出，畫面用指標的水平位置在這些層級之間挑一個（越靠左越外層）。

export interface DropLevel {
  /** 要放在哪個項目旁邊（行或括號） */
  anchorId: string;
  kind: 'row' | 'bracket';
}

function contains(item: Item, id: string): boolean {
  if (item.id === id) return true;
  return item.kind === 'bracket' && item.children.some((c) => contains(c.item, id));
}

export function dropLevels(doc: Doc, rowId: string, side: 'before' | 'after', movedIds: string[]): DropLevel[] {
  const moved = movedIds.map((id) => locate(doc, id)).filter((l) => l).map((l) => l!.list[l!.index].item);
  const out: DropLevel[] = [];
  let loc = locate(doc, rowId);
  if (!loc) return out;
  let item = loc.list[loc.index].item;
  // 指標在被拖的項目自己（或它裡面）上面：沒有可放的位置
  if (moved.some((m) => contains(m, rowId))) return out;
  for (;;) {
    out.push({ anchorId: item.id, kind: item.kind });
    const edge = side === 'before' ? loc.index === 0 : loc.index === loc.list.length - 1;
    if (!edge || !loc.parent) break;
    const parentId = loc.parent.id;
    const pl = locate(doc, parentId);
    if (!pl) break;
    loc = pl;
    item = pl.list[pl.index].item;
    if (moved.some((m) => m.id === item.id)) break; // 不能放到被拖的括號旁邊（它自己就是要移動的對象）
  }
  return out;
}
