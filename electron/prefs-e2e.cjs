// 開發用端對端：偏好設定寫進 userData/prefs.json、重新載入後生效、備份保留版數由主程序讀取。
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verse-prefs-'));
app.setPath('userData', path.join(tmp, 'userData'));
require('./main.cjs');
app.whenReady().then(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(3500);
  const win = BrowserWindow.getAllWindows()[0];
  const js = (c) => win.webContents.executeJavaScript(c);
  console.log('INITIAL FILE', fs.existsSync(path.join(tmp, 'userData', 'prefs.json')));
  await js(`window.api.setPrefs({version:1, viewZoom:1.25, relationTypes:null, autosaveSeconds:45, backupKeep:5, newDoc:null})`);
  console.log('PREFS FILE', fs.readFileSync(path.join(tmp, 'userData', 'prefs.json'), 'utf8').replace(/\s+/g, ''));
  const file = path.join(tmp, 'a.verse');
  for (let i = 0; i < 9; i++) {
    await js(`window.api.saveFile({path:${JSON.stringify(file)}, text:'v${i}', suggestedName:'a'})`);
    await wait(15);
  }
  const g = await js(`window.api.listBackups(${JSON.stringify(file)})`);
  console.log('BACKUPS KEPT', g[0].versions.length);
  win.webContents.reload();
  await wait(3000);
  console.log('ZOOM AFTER RELOAD', await js(`[...document.querySelectorAll('.toolbar select')].at(-1).value`));
  // 檔案被改壞也要能啟動
  fs.writeFileSync(path.join(tmp, 'userData', 'prefs.json'), '{ broken json');
  win.webContents.reload();
  await wait(3000);
  console.log('BROKEN FILE STARTS', await js(`document.querySelectorAll('.row').length > 0`));
  app.exit(0);
});
