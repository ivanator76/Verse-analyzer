import type { Label, RelationType } from './types';

// 內建關係表（PLAN §6）。
export const DEFAULT_RELATION_TYPES: RelationType[] = [
  { id: 'and', name: '以及', minor: '及', main: '', hasMain: 'no' },
  { id: 'progress', name: '進展', minor: '', main: '進', hasMain: 'yes' },
  { id: 'or', name: '或者', minor: '或', main: '', hasMain: 'no' },
  { id: 'compare', name: '相比', minor: '//', main: '', hasMain: 'optional' },
  { id: 'not-but', name: '不是-而是', minor: '-', main: '+', hasMain: 'yes' },
  { id: 'although', name: '雖然', minor: '雖', main: '', hasMain: 'yes' },
  { id: 'general-specific', name: '一般-特定', minor: '般', main: '特', hasMain: 'yes' },
  { id: 'explain', name: '解釋', minor: '', main: '解', hasMain: 'yes' },
  { id: 'subject-attr', name: '主格-屬性', minor: '', main: '主', hasMain: 'yes' },
  { id: 'cause-effect', name: '因果', minor: '因', main: '果', hasMain: 'yes' },
  { id: 'purpose', name: '目的', minor: '', main: '目', hasMain: 'yes' },
  { id: 'manner', name: '方式', minor: '式', main: '果', hasMain: 'yes' },
  { id: 'time', name: '時間', minor: '時', main: '', hasMain: 'yes' },
  { id: 'space', name: '空間', minor: '空', main: '', hasMain: 'yes' },
  { id: 'qa', name: '問答', minor: '問', main: '答', hasMain: 'yes' },
  { id: 'none', name: '無關係', minor: '--', main: '', hasMain: 'no' },
];

export function findType(types: RelationType[], id: string): RelationType | undefined {
  return types.find((t) => t.id === id);
}

/** 單一關係在某分支上顯示的文字（§4.5、§6）。空字串表示不顯示。 */
export function labelText(
  type: RelationType,
  label: Label,
  opts: { showMainAsterisk: boolean },
): string {
  if (label.pending) return '';
  if (label.text !== null) return label.text;
  if (type.hasMain === 'no') return type.minor;
  if (label.main) {
    const base = type.main === '' ? '*' : type.main;
    return opts.showMainAsterisk && type.main !== '' ? base + '*' : base;
  }
  return type.minor;
}

/** 關係表的合法性（§6 設定 → 關係表）。回傳錯誤訊息；空陣列表示通過。 */
export function validateRelationTypes(types: RelationType[]): string[] {
  const e: string[] = [];
  if (types.length === 0) e.push('關係表至少要有一個關係');
  const ids = new Set<string>();
  const names = new Set<string>();
  types.forEach((t, i) => {
    const at = `第 ${i + 1} 列`;
    if (!t.id || ids.has(t.id)) e.push(`${at}：id 空白或重複`);
    ids.add(t.id);
    const name = t.name.trim();
    if (!name) e.push(`${at}：名稱不能空白`);
    else if (names.has(name)) e.push(`${at}：名稱「${name}」重複`);
    names.add(name);
    if (t.minor.length > 4 || t.main.length > 4) e.push(`${at}：標記最多 4 個字`);
    if (!['yes', 'no', 'optional'].includes(t.hasMain)) e.push(`${at}：主句設定不正確`);
  });
  return e;
}

/** 產生不和現有 id 重複的新關係 id。 */
export function newTypeId(types: RelationType[]): string {
  let n = types.length + 1;
  while (types.some((t) => t.id === `custom-${n}`)) n++;
  return `custom-${n}`;
}
