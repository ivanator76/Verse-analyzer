// 檔案存取：Electron 內走 IPC（安全寫檔、備份、復原檔）；一般瀏覽器只有簡單的下載／選檔（開發用）。

export interface RecoveryEntry {
  id: string;
  path: string | null;
  savedAt: number;
  text: string;
  originalNewer: boolean;
}

export interface BackupVersion {
  path: string;
  name: string;
  savedAt: number;
  size: number;
}

export interface BackupGroup {
  key: string;
  /** 原檔路徑（舊的備份沒有記錄時是 null） */
  origin: string | null;
  label: string;
  /** 是不是目前開著的檔案 */
  current: boolean;
  versions: BackupVersion[];
}

export interface FileApi {
  exportPdf(orientation: 'portrait' | 'landscape'): Promise<string | null>;
  print(): Promise<boolean>;
  openHelp(anchor?: string): Promise<void>;
  getPrefs(): Promise<unknown>;
  setPrefs(p: unknown): Promise<void>;
  openFile(): Promise<{ path: string | null; text: string } | null>;
  saveFile(a: { path: string | null; text: string; suggestedName: string }): Promise<string | null>;
  listBackups(currentPath: string | null): Promise<BackupGroup[]>;
  readBackup(file: string): Promise<string>;
  revealBackup(file: string): Promise<void>;
  writeRecovery(a: { id: string; path: string | null; text: string }): Promise<void>;
  deleteRecovery(id: string): Promise<void>;
  listRecovery(): Promise<RecoveryEntry[]>;
  setDirty(s: { dirty: boolean; id: string | null }): void;
  onRequestSave(cb: () => void): void;
  saveResult(ok: boolean): void;
}

declare global {
  interface Window {
    api?: FileApi;
  }
}

export const hasNative = () => !!window.api;

// ───────── 瀏覽器版（網頁版）的檔案存取 ─────────
// Chrome／Edge 等支援 File System Access API：可以選檔、直接存回同一個檔案（和桌面版一樣）。
// 其他瀏覽器（Safari、Firefox）退回「選檔」與「下載」。
type FsaHandle = { name: string; getFile(): Promise<File>; createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> };
type FsaWindow = { showOpenFilePicker?: (o: unknown) => Promise<FsaHandle[]>; showSaveFilePicker?: (o: unknown) => Promise<FsaHandle> };
const fsa = () => window as unknown as FsaWindow;
const PICKER_TYPES = [{ description: '經文結構分析', accept: { 'application/json': ['.verse'] } }];
const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

let handle: FsaHandle | null = null;

export const browserApi = {
  /** 這個瀏覽器能不能直接存回檔案（不是下載新檔） */
  supportsInPlaceSave: () => typeof fsa().showSaveFilePicker === 'function',
  /** 換了一份文件（不是開檔）：忘掉目前的檔案，下次存檔要重新選位置 */
  forgetFile() {
    handle = null;
  },
  async openFile() {
    if (fsa().showOpenFilePicker) {
      try {
        const [h] = await fsa().showOpenFilePicker!({ types: PICKER_TYPES });
        handle = h;
        return { path: h.name, text: await (await h.getFile()).text() };
      } catch (e) {
        if (isAbort(e)) return null; // 使用者取消
        throw e;
      }
    }
    return new Promise<{ path: string | null; text: string } | null>((resolve, reject) => {
      // 輸入框一定要放進頁面裡：沒有掛在 DOM 上的 <input> 會在使用者選檔前被瀏覽器回收，
      // change 事件就永遠不會來，看起來就是「選了檔案什麼都沒發生」。
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.verse,application/json';
      input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      const done = () => input.remove();
      input.addEventListener('change', async () => {
        try {
          const f = input.files?.[0];
          resolve(f ? { path: null, text: await f.text() } : null);
        } catch (e) {
          reject(e);
        } finally {
          done();
        }
      });
      input.addEventListener('cancel', () => (done(), resolve(null)));
      document.body.appendChild(input);
      input.click();
    });
  },
  /** 存檔。回傳顯示用的檔名；使用者取消時回傳 null。 */
  async saveFile({ text, suggestedName, saveAs }: { text: string; suggestedName: string; saveAs?: boolean }): Promise<string | null> {
    if (fsa().showSaveFilePicker) {
      try {
        if (!handle || saveAs) handle = await fsa().showSaveFilePicker!({ suggestedName: `${suggestedName}.verse`, types: PICKER_TYPES });
        const w = await handle.createWritable();
        await w.write(text);
        await w.close();
        return handle.name;
      } catch (e) {
        if (isAbort(e)) return null;
        throw e;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `${suggestedName}.verse`;
    a.click();
    return suggestedName;
  },
};

// ───────── 復原檔：桌面版放在使用者資料夾；網頁版放在這個瀏覽器的 localStorage ─────────
const TAB_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const KEY = 'recovery:';
let heartbeat: ReturnType<typeof setInterval> | undefined;
const beat = () => localStorage.setItem(`tab:${TAB_ID}`, String(Date.now()));

export const recovery = {
  async write(a: { id: string; path: string | null; text: string }): Promise<void> {
    if (window.api) return window.api.writeRecovery(a);
    if (!heartbeat) {
      beat();
      heartbeat = setInterval(beat, 5000);
      // 分頁關掉或重新整理時馬上拿掉心跳，下一次打開才不會把自己剛才的復原檔當成「別的分頁還開著」
      window.addEventListener('pagehide', () => localStorage.removeItem(`tab:${TAB_ID}`));
    }
    try {
      localStorage.setItem(KEY + a.id, JSON.stringify({ ...a, savedAt: Date.now(), tab: TAB_ID }));
    } catch {
      /* 瀏覽器的儲存空間滿了：自動存檔就放棄，不影響編輯 */
    }
  },
  async delete(id: string): Promise<void> {
    if (window.api) return window.api.deleteRecovery(id);
    localStorage.removeItem(KEY + id);
  },
  /** 網頁版：別的分頁還開著（心跳在 15 秒內）的復原檔不算，避免兩個分頁互相跳出詢問。 */
  async list(): Promise<RecoveryEntry[]> {
    if (window.api) return window.api.listRecovery();
    const out: RecoveryEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (!k.startsWith(KEY)) continue;
      try {
        const e = JSON.parse(localStorage.getItem(k)!) as RecoveryEntry & { tab?: string };
        const alive = e.tab && e.tab !== TAB_ID && Date.now() - Number(localStorage.getItem(`tab:${e.tab}`) ?? 0) < 15000;
        if (!alive) out.push({ id: e.id, path: e.path, savedAt: e.savedAt, text: e.text, originalNewer: false });
      } catch {
        /* 壞掉的略過 */
      }
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  },
};

/** 開啟使用說明：Electron 內是獨立的視窗；一般瀏覽器開新視窗。anchor 是章節 id（例如 'brackets'）。 */
export function openHelp(anchor?: string): void {
  if (window.api) void window.api.openHelp(anchor);
  else window.open(`help.html${anchor ? '#' + anchor : ''}`, 'verse-help', 'width=1000,height=820');
}
