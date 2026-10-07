import { defaultSettings } from './doc';
import { validateRelationTypes } from './relations';
import type { RelationType, Settings } from './types';
import { validateSettings } from './validate';

// app 偏好設定（和文件分開存）。純資料與驗證；實際讀寫在 ui/prefs.ts 與 electron/main.cjs。

export interface Prefs {
  version: 1;
  /** 檢視縮放（只影響螢幕上看起來的大小，§9.4） */
  viewZoom: number;
  /** 全域關係表；null＝用內建預設（§6） */
  relationTypes: RelationType[] | null;
  /** 新文件的預設版面（對照欄不在預設裡，新文件一律沒有對照欄） */
  newDoc: Settings;
  /** 有未存的變更時，每隔幾秒自動寫一份復原檔（§10） */
  autosaveSeconds: number;
  /** 每個檔案保留最近幾版備份（§10） */
  backupKeep: number;
}

export const LIMITS = {
  viewZoom: [0.25, 3],
  autosaveSeconds: [10, 600],
  backupKeep: [5, 100],
} as const;

export function defaultPrefs(): Prefs {
  return { version: 1, viewZoom: 1, relationTypes: null, newDoc: defaultSettings(), autosaveSeconds: 30, backupKeep: 20 };
}

export function validatePrefs(p: Prefs): string[] {
  const e: string[] = [];
  const num = (v: number, [lo, hi]: readonly [number, number], name: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) e.push(`${name}必須介於 ${lo} 到 ${hi}`);
  };
  num(p.viewZoom, LIMITS.viewZoom, '檢視縮放');
  num(p.autosaveSeconds, LIMITS.autosaveSeconds, '自動存檔間隔（秒）');
  num(p.backupKeep, LIMITS.backupKeep, '備份保留版數');
  if (!Number.isInteger(p.backupKeep)) e.push('備份保留版數必須是整數');
  e.push(...validateSettings(p.newDoc));
  if (p.relationTypes) e.push(...validateRelationTypes(p.relationTypes));
  return e;
}

/**
 * 把讀進來的任意資料整理成合法的偏好設定：不合法或缺少的欄位退回預設，絕不丟出錯誤
 * （偏好設定檔被改壞時 app 仍然要能啟動）。
 */
export function sanitizePrefs(raw: unknown): Prefs {
  const d = defaultPrefs();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<Prefs>;
  const clamp = (v: unknown, [lo, hi]: readonly [number, number], fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback;

  const out: Prefs = {
    version: 1,
    viewZoom: clamp(r.viewZoom, LIMITS.viewZoom, d.viewZoom),
    relationTypes: null,
    newDoc: d.newDoc,
    autosaveSeconds: clamp(r.autosaveSeconds, LIMITS.autosaveSeconds, d.autosaveSeconds),
    backupKeep: Math.round(clamp(r.backupKeep, LIMITS.backupKeep, d.backupKeep)),
  };
  if (Array.isArray(r.relationTypes) && validateRelationTypes(r.relationTypes).length === 0) out.relationTypes = r.relationTypes;
  if (r.newDoc && typeof r.newDoc === 'object') {
    const n = r.newDoc as Settings;
    const merged: Settings = {
      ...d.newDoc,
      ...n,
      page: { ...d.newDoc.page, ...(n.page ?? {}) },
      main: { ...d.newDoc.main, ...(n.main ?? {}) },
      refColumns: [], // 新文件一律沒有對照欄
    };
    if (validateSettings(merged).length === 0) out.newDoc = merged;
  }
  return out;
}
