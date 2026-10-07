const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { backupOld, listBackups, readBackup } = require('./backups.cjs');
const path = require('path');
const fs = require('fs');

const DEV_URL = process.env.VITE_DEV_URL;

const dirs = () => {
  const base = app.getPath('userData');
  const d = { backups: path.join(base, 'backups'), recovery: path.join(base, 'recovery') };
  Object.values(d).forEach((p) => fs.mkdirSync(p, { recursive: true }));
  return d;
};

/** §10 安全寫檔：同資料夾暫存檔 → fsync → 改名取代 */
function atomicWrite(file, data) {
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

// 偏好設定：userData/prefs.json（renderer 負責驗證；主程序只讀備份保留版數）
const prefsFile = () => path.join(app.getPath('userData'), 'prefs.json');
function readPrefs() {
  try {
    return JSON.parse(fs.readFileSync(prefsFile(), 'utf8'));
  } catch {
    return null;
  }
}
const backupKeep = () => {
  const n = readPrefs()?.backupKeep;
  return Number.isInteger(n) && n >= 5 && n <= 100 ? n : 20;
};
ipcMain.handle('prefs:get', () => readPrefs());
ipcMain.handle('prefs:set', (_e, p) => {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  atomicWrite(prefsFile(), JSON.stringify(p, null, 1));
});

const recoveryFile = (id) => path.join(dirs().recovery, `${String(id).replace(/[^\w-]/g, '_')}.json`);

let dirtyState = { dirty: false, id: null };
let allowClose = false;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true },
  });
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // 關閉時有未存的變更：儲存／不儲存／取消（§10）
  win.on('close', async (e) => {
    if (allowClose || !dirtyState.dirty) return;
    e.preventDefault();
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['儲存', '不儲存', '取消'],
      defaultId: 0,
      cancelId: 2,
      message: '這份文件有尚未儲存的變更',
    });
    if (response === 2) return; // 取消：保留復原檔
    if (response === 0) {
      const ok = await new Promise((resolve) => {
        ipcMain.once('save-result', (_e, v) => resolve(v));
        win.webContents.send('request-save');
      });
      if (!ok) return;
    } else if (dirtyState.id) {
      fs.rmSync(recoveryFile(dirtyState.id), { force: true }); // 選「不儲存」：刪除復原檔
    }
    allowClose = true;
    win.close();
  });
}

// 使用說明：獨立的視窗（已經開著就叫到前面，並跳到指定的章節）
let helpWin = null;
function openHelp(anchor) {
  const hash = anchor ? String(anchor).replace(/[^\w-]/g, '') : '';
  if (helpWin && !helpWin.isDestroyed()) {
    helpWin.show();
    helpWin.focus();
    if (hash) helpWin.webContents.executeJavaScript(`location.hash = ${JSON.stringify('#' + hash)}`);
    return;
  }
  helpWin = new BrowserWindow({ width: 1000, height: 820, title: '使用說明', backgroundColor: '#ffffff' });
  helpWin.setMenuBarVisibility(false);
  if (DEV_URL) helpWin.loadURL(`${DEV_URL.replace(/\/$/, '')}/help.html${hash ? '#' + hash : ''}`);
  else helpWin.loadFile(path.join(__dirname, '..', 'dist', 'help.html'), hash ? { hash } : undefined);
  helpWin.on('closed', () => (helpWin = null));
}
ipcMain.handle('help:open', (_e, anchor) => openHelp(anchor));

ipcMain.on('set-dirty', (_e, s) => (dirtyState = s));

ipcMain.handle('file:open', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, { filters: [{ name: '經文結構分析', extensions: ['verse'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  return { path: r.filePaths[0], text: fs.readFileSync(r.filePaths[0], 'utf8') };
});

ipcMain.handle('file:save', async (e, { path: p, text, suggestedName }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  let file = p;
  if (!file) {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: (suggestedName || '未命名') + '.verse',
      filters: [{ name: '經文結構分析', extensions: ['verse'] }],
    });
    if (r.canceled || !r.filePath) return null;
    file = r.filePath;
  }
  backupOld(dirs().backups, file, new Date(), backupKeep());
  atomicWrite(file, text);
  return file;
});

ipcMain.handle('backups:list', (_e, currentPath) => listBackups(dirs().backups, currentPath));
ipcMain.handle('backups:read', (_e, file) => readBackup(dirs().backups, file));
ipcMain.handle('backups:reveal', (_e, file) => shell.showItemInFolder(file));

ipcMain.handle('recovery:write', (_e, { id, path: p, text }) => {
  atomicWrite(recoveryFile(id), JSON.stringify({ id, path: p, savedAt: Date.now(), text }));
});
ipcMain.handle('recovery:delete', (_e, id) => fs.rmSync(recoveryFile(id), { force: true }));
ipcMain.handle('recovery:list', () => {
  const out = [];
  for (const f of fs.readdirSync(dirs().recovery)) {
    if (!f.endsWith('.json')) continue;
    try {
      const r = JSON.parse(fs.readFileSync(path.join(dirs().recovery, f), 'utf8'));
      r.originalNewer = !!(r.path && fs.existsSync(r.path) && fs.statSync(r.path).mtimeMs > r.savedAt);
      out.push(r);
    } catch {
      /* 壞掉的復原檔略過 */
    }
  }
  return out;
});

ipcMain.handle('print', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return new Promise((resolve) => win.webContents.print({ printBackground: true }, (ok) => resolve(ok)));
});

// §9.1：A4、依文件設定直橫向、preferCSSPageSize、邊界 0
ipcMain.handle('export-pdf', async (event, orientation) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    defaultPath: '經文結構分析.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return null;
  const data = await win.webContents.printToPDF({
    pageSize: 'A4',
    landscape: orientation === 'landscape',
    preferCSSPageSize: true,
    printBackground: true,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  atomicWrite(filePath, data);
  return filePath;
});

app.whenReady().then(() => {
  // 開發模式（npm run electron）的 Dock 圖示；打包好的 app 用 .icns
  if (!app.isPackaged && process.platform === 'darwin' && app.dock) {
    const icon = path.join(__dirname, '..', 'assets', 'icon-1024.png');
    if (fs.existsSync(icon)) app.dock.setIcon(icon);
  }
  createWindow();
});
app.on('window-all-closed', () => app.quit());
