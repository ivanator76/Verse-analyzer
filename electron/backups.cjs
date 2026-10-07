// 備份（PLAN §10）：存檔前把舊版複製到備份資料夾，每個檔案保留最近 N 版。
// 純 fs 函式（不依賴 electron），方便測試。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_BACKUPS = 20;
const META = '_origin.json';

const keyOf = (file) => crypto.createHash('sha1').update(file).digest('hex').slice(0, 12);

/** 存檔前呼叫：把 file 目前的內容備份起來。檔案不存在（第一次存）就什麼都不做。 */
function backupOld(backupsDir, file, now = new Date(), keep = MAX_BACKUPS) {
  if (!fs.existsSync(file)) return null;
  const dir = path.join(backupsDir, keyOf(file));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, META), JSON.stringify({ path: file })); // 記下原檔路徑，瀏覽備份時顯示
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `${stamp}-${path.basename(file)}`);
  fs.copyFileSync(file, dest);
  const all = fs.readdirSync(dir).filter((f) => f !== META).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) fs.unlinkSync(path.join(dir, old));
  return dest;
}

/** 檔名開頭的時間戳記 → Date（解析不出來就用檔案修改時間） */
function stampOf(name, fallback) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-/.exec(name);
  return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : fallback;
}

/**
 * 列出所有備份，依原檔分組。每組的版本由新到舊。
 * currentPath：目前開著的檔案（用來把它那一組排在最前面並標記）。
 */
function listBackups(backupsDir, currentPath = null) {
  if (!fs.existsSync(backupsDir)) return [];
  const curKey = currentPath ? keyOf(currentPath) : null;
  const groups = [];
  for (const key of fs.readdirSync(backupsDir)) {
    const dir = path.join(backupsDir, key);
    if (!fs.statSync(dir).isDirectory()) continue;
    let origin = null;
    try {
      origin = JSON.parse(fs.readFileSync(path.join(dir, META), 'utf8')).path;
    } catch {
      /* 舊的備份沒有 meta */
    }
    const versions = fs
      .readdirSync(dir)
      .filter((f) => f !== META)
      .map((f) => {
        const p = path.join(dir, f);
        const st = fs.statSync(p);
        return { path: p, name: f.replace(/^[\d\-T]+Z-/, ''), savedAt: stampOf(f, st.mtime).getTime(), size: st.size };
      })
      .sort((a, b) => b.savedAt - a.savedAt);
    if (!versions.length) continue;
    groups.push({ key, origin, label: origin ? path.basename(origin) : versions[0].name, current: key === curKey, versions });
  }
  return groups.sort((a, b) => Number(b.current) - Number(a.current) || b.versions[0].savedAt - a.versions[0].savedAt);
}

/** 只允許讀備份資料夾裡的檔案（IPC 傳來的路徑不能信）。 */
function readBackup(backupsDir, file) {
  const root = path.resolve(backupsDir) + path.sep;
  const full = path.resolve(file);
  if (!full.startsWith(root)) throw new Error('不在備份資料夾裡');
  return fs.readFileSync(full, 'utf8');
}

module.exports = { backupOld, listBackups, readBackup, keyOf, MAX_BACKUPS, META };
