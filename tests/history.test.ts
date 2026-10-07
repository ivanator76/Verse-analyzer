import { describe, expect, it } from 'vitest';
import { createDoc } from '../src/core/doc';
import * as H from '../src/core/history';
import type { Doc } from '../src/core/types';

const mk = (n: number): Doc => ({ ...createDoc(), counter: n });

describe('歷史與打字群組（§3.2、§3.5）', () => {
  it('停頓 1 秒內合併，超過就拆開', () => {
    let h = H.createHistory(mk(0));
    h = H.pushTyping(h, mk(1), 'r1', null, 0, false);
    h = H.pushTyping(h, mk(2), 'r1', null, 900, false);
    expect(h.past.length).toBe(1);
    h = H.pushTyping(h, mk(3), 'r1', null, 2500, false);
    expect(h.past.length).toBe(2);
  });
  it('組字期間不計停頓，整段是一步', () => {
    let h = H.createHistory(mk(0));
    h = H.pushTyping(h, mk(1), 'r1', null, 0, true);
    h = H.pushTyping(h, mk(2), 'r1', null, 60_000, true);
    h = H.pushTyping(h, mk(3), 'r1', null, 120_000, true);
    expect(h.past.length).toBe(1);
  });
  it('換格子、其他指令、移動游標、存檔都會結束群組', () => {
    let h = H.createHistory(mk(0));
    h = H.pushTyping(h, mk(1), 'r1', null, 0, false);
    h = H.pushTyping(h, mk(2), 'r2', null, 10, false);
    expect(h.past.length).toBe(2);
    h = H.closeGroup(h);
    h = H.pushTyping(h, mk(3), 'r2', null, 20, false);
    expect(h.past.length).toBe(3);
    h = H.push(H.markSaved(h), mk(4), null);
    h = H.pushTyping(h, mk(5), 'r2', null, 30, false);
    expect(h.past.length).toBe(5);
  });
  it('復原回到存檔狀態就不再是已編輯', () => {
    let h = H.createHistory(mk(0));
    h = H.push(h, mk(1), { rowId: 'r1', offset: 3 });
    expect(H.isDirty(h)).toBe(true);
    const u = H.undo(h, null)!;
    expect(H.isDirty(u.h)).toBe(false);
    expect(u.sel).toEqual({ rowId: 'r1', offset: 3 });
    expect(H.isDirty(H.redo(u.h, null)!.h)).toBe(true);
  });
});
