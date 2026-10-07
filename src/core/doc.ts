import { DEFAULT_RELATION_TYPES } from './relations';
import type { Doc, RelationType, Row, Seg } from './types';

export function defaultSettings(): Doc['settings'] {
  return {
    direction: 'ltr',
    page: { size: 'A4', orientation: 'portrait', margins: [15, 15, 15, 20] },
    layoutScale: 1,
    main: { lang: 'grc', font: 'Gentium Plus', size: 11 },
    refColumns: [],
    indentStep: 6,
    treePadLeft: 0,
    labelSeparator: '/',
    showMainAsterisk: false,
  };
}

export function emptyRow(id: string, main: Seg[] = []): Row {
  return { kind: 'row', id, indent: 0, pageBreakBefore: false, main, refs: {} };
}

export function createDoc(title = '未命名', relationTypes: RelationType[] = DEFAULT_RELATION_TYPES, settings: Doc['settings'] = defaultSettings()): Doc {
  return {
    formatVersion: 1,
    meta: { title, startChapter: 1 },
    settings: structuredClone(settings),
    relationTypes: structuredClone(relationTypes), // 新文件複製一份全域關係表；之後全域表怎麼改，舊檔案都顯示得和當初一樣
    items: [{ labels: {}, item: emptyRow('r1') }],
    counter: 1,
  };
}
