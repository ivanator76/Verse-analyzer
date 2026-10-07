import type { Doc } from './types';

// 復原歷史（PLAN §3）：保存「文件快照＋選取範圍」；不可變結構所以快照很便宜。

export interface Sel {
  rowId: string;
  /** 省略＝分析欄 */
  col?: string;
  /** ProseMirror 內容內的位移（經節標記算 1） */
  offset: number;
}

interface Entry {
  doc: Doc;
  /** 回到這份快照時要還原的選取範圍 */
  sel: Sel | null;
}

export interface History {
  past: Entry[];
  present: Doc;
  future: Entry[];
  saved: Doc;
  /** 目前開著的「連續打字」群組 */
  group: { rowId: string; time: number } | null;
}

export const TYPING_GAP_MS = 1000;

export function createHistory(doc: Doc): History {
  return { past: [], present: doc, future: [], saved: doc, group: null };
}

export function isDirty(h: History): boolean {
  return h.present !== h.saved;
}

/** 一般指令：一個復原步驟，並結束打字群組。selBefore＝操作前的選取範圍。 */
export function push(h: History, doc: Doc, selBefore: Sel | null): History {
  if (doc === h.present) return h;
  return { ...h, past: [...h.past, { doc: h.present, sel: selBefore }], present: doc, future: [], group: null };
}

/**
 * 打字：同一格連續打字合併成一步（§3.2）。
 * 組字中（composing）一律併入目前群組，不計停頓時間；組字結束後才開始計時。
 */
export function pushTyping(
  h: History,
  doc: Doc,
  rowId: string,
  selBefore: Sel | null,
  now: number,
  composing: boolean,
): History {
  if (doc === h.present) return h;
  const g = h.group;
  const merge = g && g.rowId === rowId && (composing || now - g.time <= TYPING_GAP_MS);
  if (merge) return { ...h, present: doc, future: [], group: { rowId, time: now } };
  return { ...h, past: [...h.past, { doc: h.present, sel: selBefore }], present: doc, future: [], group: { rowId, time: now } };
}

/** 移動游標、存檔、其他指令：結束打字群組。 */
export function closeGroup(h: History): History {
  return h.group ? { ...h, group: null } : h;
}

export function markSaved(h: History): History {
  return { ...closeGroup(h), saved: h.present };
}

export function undo(h: History, selNow: Sel | null): { h: History; sel: Sel | null } | null {
  const e = h.past[h.past.length - 1];
  if (!e) return null;
  return {
    h: { ...h, past: h.past.slice(0, -1), present: e.doc, future: [...h.future, { doc: h.present, sel: selNow }], group: null },
    sel: e.sel,
  };
}

export function redo(h: History, selNow: Sel | null): { h: History; sel: Sel | null } | null {
  const e = h.future[h.future.length - 1];
  if (!e) return null;
  return {
    h: { ...h, future: h.future.slice(0, -1), past: [...h.past, { doc: h.present, sel: selNow }], present: e.doc, group: null },
    sel: e.sel,
  };
}

/** 組字結束時重新起算停頓時間（§3.2）。 */
export function touchGroup(h: History, now: number): History {
  return h.group ? { ...h, group: { ...h.group, time: now } } : h;
}
