// 開發用端對端：在暫存的 userData 裡真的存檔幾次，再打開「開啟備份」對話框截圖。
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verse-e2e-'));
app.setPath('userData', path.join(tmp, 'userData'));
require('./main.cjs');
app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 3500));
  const win = BrowserWindow.getAllWindows()[0];
  const file = path.join(tmp, '約翰福音.verse');
  const js = (code) => win.webContents.executeJavaScript(code);
  // 存 4 次：每次存檔前，舊版會備份
  for (let i = 1; i <= 4; i++) {
    const r = await js(`(async()=>{ const d=JSON.parse(await (await fetch('/src/core/sample.ts')).text().then(()=>'null')||'null'); return 0 })()`).catch(() => 0);
    void r;
    const text = fs.readFileSync(i % 2 ? '/tmp/ref/sample_v1.verse' : '/tmp/ref/sample_v2.verse', 'utf8');
    await js(`window.api.saveFile({path:${JSON.stringify(file)}, text:${JSON.stringify(text)}, suggestedName:'x'})`);
    await new Promise((r) => setTimeout(r, 30));
  }
  const groups = await js(`window.api.listBackups(${JSON.stringify(file)})`);
  console.log('GROUPS', JSON.stringify(groups.map((g) => ({ label: g.label, current: g.current, n: g.versions.length, origin: g.origin }))));
  const read = await js(`window.api.readBackup(${JSON.stringify(groups[0].versions[0].path)})`);
  console.log('NEWEST BACKUP CONTENT', read);
  let denied = 'no';
  try { await js(`window.api.readBackup('/etc/hosts')`); } catch (e) { denied = 'rejected'; }
  console.log('READ OUTSIDE', denied);
  // 打開對話框
  await js(`window.__p = 1; (async()=>{ const set=(el,v)=>{}; })()`);
  await js(`[...document.querySelectorAll('button')].find(b=>b.innerText==='開啟備份…').click()`);
  await new Promise((r) => setTimeout(r, 800));
  const txt = await js(`document.querySelector('.modal')?.innerText`);
  console.log('DIALOG', JSON.stringify(txt));
  const img = await win.webContents.capturePage();
  fs.writeFileSync('/tmp/ref/backups.png', img.toPNG());
  app.exit(0);
});
