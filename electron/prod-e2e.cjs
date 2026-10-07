// 開發用端對端：不靠開發伺服器，直接載入打包好的 dist（file://），確認正式版真的能跑：
// 畫面出現、字型載入、經文資料（獨立的 JS 檔）能載入、使用說明視窗能開。
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
delete process.env.VITE_DEV_URL;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verse-prod-'));
app.setPath('userData', path.join(tmp, 'userData'));
require('./main.cjs');
app.whenReady().then(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(4000);
  const main = BrowserWindow.getAllWindows()[0];
  const js = (w, c) => w.webContents.executeJavaScript(c);
  console.log('URL', main.webContents.getURL().slice(0, 60));
  console.log('ROWS', await js(main, `document.querySelectorAll('.row').length`));
  console.log('FONT', await js(main, `document.fonts.check('12pt "Gentium Plus"')`));
  await js(main, `(()=>{const s=document.querySelector('.toolbar select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'bible'); s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait(3000);
  console.log('BIBLE PREVIEW', (await js(main, `document.querySelector('.bible-prev')?.innerText.replace(/\\s+/g,' ').slice(0,80)`)) ?? 'NONE');
  await js(main, `[...document.querySelectorAll('.modal button')].find(b=>b.innerText==='取消')?.click()`);
  await js(main, `[...document.querySelectorAll('button')].find(b=>b.innerText==='說明').click()`);
  await wait(2500);
  const help = BrowserWindow.getAllWindows().find((w) => w !== main);
  console.log('HELP', help ? help.webContents.getURL().slice(-30) : 'NONE', help ? await js(help, `document.querySelectorAll('#toc li').length`) : 0);
  // 存檔 → 開檔
  const file = path.join(tmp, 't.verse');
  const saved = await js(main, `window.api.saveFile({path:${JSON.stringify(file)}, text:'{}', suggestedName:'t'})`);
  console.log('SAVE', saved === file, fs.existsSync(file));
  app.exit(0);
});
