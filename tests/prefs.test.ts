import { describe, expect, it } from 'vitest';
import { createDoc } from '../src/core/doc';
import { defaultPrefs, sanitizePrefs, validatePrefs } from '../src/core/prefs';
import { DEFAULT_RELATION_TYPES } from '../src/core/relations';

describe('偏好設定', () => {
  it('預設值合法', () => expect(validatePrefs(defaultPrefs())).toEqual([]));

  it('壞掉或缺少的資料退回預設，不丟錯誤', () => {
    for (const raw of [null, undefined, 42, 'x', [], {}, { viewZoom: 'big' }, { backupKeep: 1 }, { newDoc: { layoutScale: 99 } }]) {
      const p = sanitizePrefs(raw);
      expect(validatePrefs(p)).toEqual([]);
    }
    expect(sanitizePrefs({ viewZoom: 99 }).viewZoom).toBe(1);
    expect(sanitizePrefs({ backupKeep: 1 }).backupKeep).toBe(20);
  });

  it('合法的欄位保留；只壞一個欄位不影響其他', () => {
    const p = sanitizePrefs({ viewZoom: 1.5, autosaveSeconds: 60, backupKeep: 50, newDoc: { layoutScale: 99, main: { size: 12 } } });
    expect(p.viewZoom).toBe(1.5);
    expect(p.autosaveSeconds).toBe(60);
    expect(p.backupKeep).toBe(50);
    expect(p.newDoc.layoutScale).toBe(1); // 不合法 → 整份新文件預設退回
  });

  it('新文件預設版面：合併預設、對照欄一律清空', () => {
    const p = sanitizePrefs({
      newDoc: { page: { orientation: 'landscape' }, main: { size: 13 }, indentStep: 5.1, refColumns: [{ id: 'c1', lang: 'en', visible: true, width: 0.2, mode: 'row' }] },
    });
    expect(p.newDoc.page.orientation).toBe('landscape');
    expect(p.newDoc.page.margins).toEqual([15, 15, 15, 20]);
    expect(p.newDoc.main.size).toBe(13);
    expect(p.newDoc.main.lang).toBe('grc');
    expect(p.newDoc.refColumns).toEqual([]);
  });

  it('全域關係表：不合法時退回內建（null）', () => {
    expect(sanitizePrefs({ relationTypes: [] }).relationTypes).toBeNull();
    const ok = [...DEFAULT_RELATION_TYPES, { id: 'custom-1', name: '自訂', minor: '自', main: '', hasMain: 'yes' }];
    expect(sanitizePrefs({ relationTypes: ok }).relationTypes).toEqual(ok);
    expect(sanitizePrefs({ relationTypes: [{ id: 'a', name: '', minor: '', main: '', hasMain: 'yes' }] }).relationTypes).toBeNull();
  });

  it('新文件使用偏好設定的版面，之後改偏好不影響已建立的文件', () => {
    const p = sanitizePrefs({ newDoc: { main: { size: 14 }, indentStep: 7 } });
    const a = createDoc('a', undefined, p.newDoc);
    p.newDoc.main.size = 9;
    expect(a.settings.main.size).toBe(14);
    expect(a.settings.indentStep).toBe(7);
  });
});
