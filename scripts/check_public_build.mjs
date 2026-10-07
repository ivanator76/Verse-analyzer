// 公開的網頁版（npm run build:public）建置後的檢查：不能有範例文件、不能有參考用的 PDF。
// 用法：npm run build:public && npm run check:public
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const dist = path.resolve(import.meta.dirname, '..', 'dist');
const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(path.join(dir, f)).isDirectory() ? files(path.join(dir, f)) : [path.join(dir, f)]));
const all = files(dist);
const problems = [];

for (const f of all) {
  if (/\.pdf$/i.test(f)) problems.push(`不該出現的 PDF：${path.relative(dist, f)}`);
  if (/\.(js|html|css|json)$/.test(f)) {
    const text = readFileSync(f, 'utf8');
    // 範例文件的特徵字串（sample.ts／stressDoc）
    for (const marker of ['約翰福音三 14 至 21（範例）', 'stress-root', '跨頁壓力測試', '範例：約翰福音']) {
      if (text.includes(marker)) problems.push(`${path.relative(dist, f)} 含有範例文件的字串：「${marker}」`);
    }
  }
}
// 必要的檔案
for (const need of ['index.html', 'help.html']) if (!all.some((f) => path.relative(dist, f) === need)) problems.push(`缺少 ${need}`);
if (!all.some((f) => /assets\/sblgnt-.*\.js$/.test(f))) problems.push('缺少 SBLGNT 資料的 chunk');

if (problems.length) {
  console.error('公開版檢查失敗：\n- ' + problems.join('\n- '));
  process.exit(1);
}
const mb = (all.reduce((a, f) => a + statSync(f).size, 0) / 1048576).toFixed(1);
console.log(`公開版檢查通過：${all.length} 個檔案，${mb} MB`);
