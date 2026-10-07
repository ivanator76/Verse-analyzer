// 開發用端對端：按「說明」會開出獨立的使用說明視窗；再按一次不會開第二個，並跳到指定章節。
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verse-help-'));
app.setPath('userData', path.join(tmp, 'userData'));
require('./main.cjs');
app.whenReady().then(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(3500);
  const main = BrowserWindow.getAllWindows()[0];
  const js = (w, c) => w.webContents.executeJavaScript(c);
  console.log('WINDOWS BEFORE', BrowserWindow.getAllWindows().length);
  await js(main, `[...document.querySelectorAll('button')].find(b=>b.innerText==='說明').click()`);
  await wait(2500);
  const wins = BrowserWindow.getAllWindows();
  console.log('WINDOWS AFTER', wins.length);
  const help = wins.find((w) => w !== main);
  console.log('HELP URL', help.webContents.getURL(), 'TITLE', help.getTitle());
  await js(main, `[...document.querySelectorAll('button')].find(b=>b.innerText==='說明').click()`);
  await wait(800);
  console.log('WINDOWS AFTER 2ND CLICK', BrowserWindow.getAllWindows().length);
  // 從對話框的「? 說明」連結開：跳到對應章節
  await js(main, `[...document.querySelectorAll('button')].find(b=>b.innerText.startsWith('版面設定')).click()`);
  await wait(500);
  await js(main, `document.querySelector('.modal .helplink').click()`);
  await wait(1200);
  console.log('HASH', await js(help, `location.hash`), 'WINDOWS', BrowserWindow.getAllWindows().length);
  console.log('TOC ITEMS', await js(help, `document.querySelectorAll('#toc li').length`));
  fs.writeFileSync('/tmp/ref/help_window.png', (await help.webContents.capturePage()).toPNG());
  app.exit(0);
});
