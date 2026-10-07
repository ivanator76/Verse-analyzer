// 開發用：不開視窗互動，直接載入 app、等字型與版面完成後匯出 PDF（驗收比對用）
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const out = process.env.OUT || '/tmp/ref/app.pdf';
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1100, height: 1400, webPreferences: { offscreen: false } });
  await win.loadURL(process.env.VITE_DEV_URL || 'http://localhost:5173');
  await new Promise((r) => setTimeout(r, 2500));
  if (process.env.PRE_JS) { await win.webContents.executeJavaScript(process.env.PRE_JS); await new Promise((r) => setTimeout(r, 1500)); }
  const info = await win.webContents.executeJavaScript('({pages:document.querySelectorAll(".sheet .page").length, h:document.querySelector(".sheet").getBoundingClientRect().height})');
  const data = await win.webContents.printToPDF({ pageSize: 'A4', preferCSSPageSize: true, printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  fs.writeFileSync(out, data);
  console.log('exported', out, JSON.stringify(info));
  app.quit();
});
