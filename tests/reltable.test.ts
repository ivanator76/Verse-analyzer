import { describe, expect, it } from 'vitest';
import * as C from '../src/core/commands';
import { createDoc } from '../src/core/doc';
import { DEFAULT_RELATION_TYPES, newTypeId, validateRelationTypes } from '../src/core/relations';
import { sampleJohn3 } from '../src/core/sample';
import { validate } from '../src/core/validate';

describe('關係表（§6）', () => {
  it('內建關係表合法', () => expect(validateRelationTypes(DEFAULT_RELATION_TYPES)).toEqual([]));

  it('擋下空白或重複的名稱、過長的標記、重複的 id', () => {
    const t = structuredClone(DEFAULT_RELATION_TYPES);
    t[0].name = '';
    t[1].name = t[2].name;
    t[3].minor = '太長的標記了';
    t[4].id = t[5].id;
    const e = validateRelationTypes(t).join('\n');
    expect(e).toContain('名稱不能空白');
    expect(e).toContain('重複');
    expect(e).toContain('最多 4 個字');
    expect(validateRelationTypes([])).toEqual(['關係表至少要有一個關係']);
  });

  it('新文件複製一份關係表：之後修改全域表，舊文件不受影響', () => {
    const global = structuredClone(DEFAULT_RELATION_TYPES);
    const a = createDoc('a', global);
    global[0].name = '被改名了';
    global.push({ id: newTypeId(global), name: '新關係', minor: '新', main: '主', hasMain: 'yes' });
    expect(a.relationTypes[0].name).toBe('以及');
    expect(a.relationTypes.length).toBe(DEFAULT_RELATION_TYPES.length);
    const b = createDoc('b', global);
    expect(b.relationTypes.at(-1)!.name).toBe('新關係');
  });

  it('加入目前文件：只加入沒有的關係，已有的完全不動，舊文件的標記顯示不變', () => {
    const doc = sampleJohn3();
    const global = structuredClone(DEFAULT_RELATION_TYPES);
    global[0] = { ...global[0], minor: '並' }; // 全域表改了「以及」的標記
    global.push({ id: 'custom-99', name: '讓步', minor: '讓', main: '', hasMain: 'yes' });
    const r = C.mergeRelationTypes(doc, global);
    if ('error' in r) throw new Error(r.error);
    expect(r.doc.relationTypes.find((t) => t.id === 'and')!.minor).toBe('及'); // 沒被改
    expect(r.doc.relationTypes.at(-1)!.name).toBe('讓步');
    expect(r.notices[0]).toContain('讓步');
    expect(validate(r.doc)).toEqual([]);
    // 已經都有了
    expect('error' in C.mergeRelationTypes(r.doc, global)).toBe(true);
  });

  it('自訂關係可以用在括號上', () => {
    const doc = createDoc('x', [
      ...DEFAULT_RELATION_TYPES,
      { id: 'custom-99', name: '讓步', minor: '讓', main: '', hasMain: 'yes' },
    ]);
    expect(doc.relationTypes.some((t) => t.id === 'custom-99')).toBe(true);
    expect(newTypeId(doc.relationTypes)).not.toBe('custom-99');
  });
});
