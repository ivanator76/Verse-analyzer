// 快捷鍵的顯示：程式裡和說明裡都用 Mac 的符號寫（⌘ ⌥ ⇧）；在 Windows／Linux 上顯示成 Ctrl、Alt、Shift。
// 實際的快捷鍵判斷用的是「⌘ 或 Ctrl」，所以兩種系統都能用。

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const NAME: Record<string, string> = { '⌘': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift' };

/** 把文字裡的 ⌘⌥⇧ 換成 Ctrl／Alt／Shift（Mac 不換）。例如「⇧⌘G」→「Shift+Ctrl+G」、「⌘ Enter」→「Ctrl+Enter」。 */
export function k(s: string, mac = isMac): string {
  if (mac) return s;
  return s.replace(/([⌘⌥⇧]+)(\s?)(Enter|Tab|Esc|Delete|Backspace|[A-Za-z0-9,/[\]↑↓←→])?/g, (_m, run: string, sp: string, key?: string) => {
    const names = [...run].map((c) => NAME[c]).join('+');
    return key ? `${names}+${key}` : `${names}${sp}`;
  });
}
