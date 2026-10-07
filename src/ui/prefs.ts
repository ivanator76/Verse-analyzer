import { defaultPrefs, sanitizePrefs, type Prefs } from '../core/prefs';
import { DEFAULT_RELATION_TYPES } from '../core/relations';
import type { RelationType } from '../core/types';

// app 偏好設定的讀寫。Electron 內存在使用者資料夾的 prefs.json（打包好的 app 和開發模式各用各的使用者資料夾，設定、備份、復原檔不共用）；
// 一般瀏覽器（開發用）退回 localStorage。啟動時先 initPrefs()，之後用 getPrefs() 同步讀取。

const KEY = 'prefs';
let cache: Prefs = defaultPrefs();
const listeners = new Set<() => void>();

export async function initPrefs(): Promise<void> {
  let raw: unknown = null;
  try {
    raw = window.api ? await window.api.getPrefs() : JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    raw = null; // 檔案壞掉也要能啟動
  }
  // 舊版把檢視縮放與關係表各存在 localStorage：第一次啟動時搬進來
  const legacy: Record<string, unknown> = {};
  try {
    const z = Number(localStorage.getItem('viewZoom'));
    if (z) legacy.viewZoom = z;
    const r = localStorage.getItem('relationTypes');
    if (r) legacy.relationTypes = JSON.parse(r);
  } catch {
    /* 略過 */
  }
  const base = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  cache = sanitizePrefs({ ...legacy, ...base });
  if (!raw && Object.keys(legacy).length) void persist();
}

async function persist(): Promise<void> {
  if (window.api) await window.api.setPrefs(cache);
  else localStorage.setItem(KEY, JSON.stringify(cache));
}

export const getPrefs = (): Prefs => cache;

export function subscribePrefs(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 更新偏好設定（不合法的欄位會被退回預設）並存檔。 */
export async function savePrefs(patch: Partial<Prefs>): Promise<Prefs> {
  cache = sanitizePrefs({ ...cache, ...patch });
  listeners.forEach((l) => l());
  await persist();
  return cache;
}

export const resetPrefs = () => savePrefs(defaultPrefs());

/** 全域關係表：新文件會複製一份到檔案裡（§6）。 */
export const getRelationTypes = (): RelationType[] => structuredClone(cache.relationTypes ?? DEFAULT_RELATION_TYPES);
export const setRelationTypes = (types: RelationType[]) => void savePrefs({ relationTypes: types });
export const resetRelationTypes = () => {
  void savePrefs({ relationTypes: null });
  return structuredClone(DEFAULT_RELATION_TYPES);
};
