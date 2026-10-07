import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

const require_ = createRequire(import.meta.url);
const { backupOld, listBackups, readBackup, MAX_BACKUPS, META } = require_('../electron/backups.cjs');

const setup = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'verse-bk-'));
  const backups = path.join(root, 'backups');
  mkdirSync(backups);
  return { root, backups };
};

describe('備份（§10）', () => {
  it('第一次存檔（檔案還不存在）不會產生備份', () => {
    const { root, backups } = setup();
    expect(backupOld(backups, path.join(root, 'new.verse'))).toBeNull();
    expect(listBackups(backups)).toEqual([]);
  });

  it('每個檔案只保留最近 20 版，由新到舊列出，並記下原檔路徑', () => {
    const { root, backups } = setup();
    const f = path.join(root, 'a.verse');
    for (let i = 0; i < MAX_BACKUPS + 5; i++) {
      writeFileSync(f, `v${i}`);
      backupOld(backups, f, new Date(Date.UTC(2026, 9, 5, 12, 0, i)));
    }
    const groups = listBackups(backups);
    expect(groups.length).toBe(1);
    expect(groups[0].origin).toBe(f);
    expect(groups[0].label).toBe('a.verse');
    expect(groups[0].versions.length).toBe(MAX_BACKUPS);
    const times = groups[0].versions.map((v: { savedAt: number }) => v.savedAt);
    expect([...times].sort((a, b) => b - a)).toEqual(times); // 新到舊
    expect(times[0]).toBe(Date.UTC(2026, 9, 5, 12, 0, MAX_BACKUPS + 4));
    // 最舊的 5 版被刪掉了：內容最舊的是 v5
    expect(readBackup(backups, groups[0].versions.at(-1).path)).toBe('v5');
    expect(readBackup(backups, groups[0].versions[0].path)).toBe(`v${MAX_BACKUPS + 4}`);
  });

  it('依原檔分組；目前開著的檔案那一組排在最前面', () => {
    const { root, backups } = setup();
    const a = path.join(root, 'a.verse');
    const b = path.join(root, 'b.verse');
    writeFileSync(a, 'a');
    writeFileSync(b, 'b');
    backupOld(backups, a, new Date(Date.UTC(2026, 9, 5, 12, 0, 0)));
    backupOld(backups, b, new Date(Date.UTC(2026, 9, 6, 12, 0, 0)));
    expect(listBackups(backups).map((g: { label: string }) => g.label)).toEqual(['b.verse', 'a.verse']); // 沒指定：最近的先
    const g = listBackups(backups, a);
    expect(g.map((x: { label: string }) => x.label)).toEqual(['a.verse', 'b.verse']);
    expect(g[0].current).toBe(true);
  });

  it('舊的備份（沒有原檔記錄）仍然能列出', () => {
    const { backups } = setup();
    const dir = path.join(backups, 'abc123');
    mkdirSync(dir);
    writeFileSync(path.join(dir, '2026-10-01T08-00-00-000Z-old.verse'), '{}');
    const g = listBackups(backups);
    expect(g[0].origin).toBeNull();
    expect(g[0].label).toBe('old.verse');
    expect(new Date(g[0].versions[0].savedAt).toISOString()).toBe('2026-10-01T08:00:00.000Z');
    expect(readdirSync(dir).includes(META)).toBe(false);
  });

  it('只能讀備份資料夾裡的檔案', () => {
    const { root, backups } = setup();
    const secret = path.join(root, 'secret.txt');
    writeFileSync(secret, 'x');
    expect(() => readBackup(backups, secret)).toThrow();
    expect(() => readBackup(backups, path.join(backups, '..', 'secret.txt'))).toThrow();
  });
});

describe('備份保留版數可以設定', () => {
  it('keep 參數決定保留幾版', () => {
    const { root, backups } = setup();
    const f = path.join(root, 'k.verse');
    for (let i = 0; i < 12; i++) {
      writeFileSync(f, `v${i}`);
      backupOld(backups, f, new Date(Date.UTC(2026, 9, 5, 12, 0, i)), 5);
    }
    const g = listBackups(backups);
    expect(g[0].versions.length).toBe(5);
    expect(readBackup(backups, g[0].versions.at(-1).path)).toBe('v7');
  });
});
