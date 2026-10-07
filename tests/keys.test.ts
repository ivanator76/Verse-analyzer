import { describe, expect, it } from 'vitest';
import { k } from '../src/ui/keys';

describe('快捷鍵的顯示（Mac 符號 → Windows／Linux 名稱）', () => {
  it('Mac 不改', () => expect(k('可按 ⌘Z 復原，⇧⌘G、⌥↑', true)).toBe('可按 ⌘Z 復原，⇧⌘G、⌥↑'));
  it('Windows／Linux：⌘→Ctrl、⌥→Alt、⇧→Shift，組合用 + 連起來', () => {
    expect(k('⌘Z', false)).toBe('Ctrl+Z');
    expect(k('⇧⌘G', false)).toBe('Shift+Ctrl+G');
    expect(k('⌘⇧G：先點選括號的垂直線', false)).toBe('Ctrl+Shift+G：先點選括號的垂直線');
    expect(k('⌥↑', false)).toBe('Alt+↑');
    expect(k('⌘ Enter', false)).toBe('Ctrl+Enter');
    expect(k('⇧ Tab', false)).toBe('Shift+Tab');
    expect(k('⌘]：併入下方相鄰的括號', false)).toBe('Ctrl+]：併入下方相鄰的括號');
    expect(k('⌘,', false)).toBe('Ctrl+,');
    expect(k('⌘/', false)).toBe('Ctrl+/');
  });
  it('後面沒有接按鍵的符號只換成名稱', () => {
    expect(k('點選整行（⇧連選、⌘加選）', false)).toBe('點選整行（Shift連選、Ctrl加選）');
    expect(k('可以用 ⌘Z 一次回到交換前', false)).toBe('可以用 Ctrl+Z 一次回到交換前');
  });
});
