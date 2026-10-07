// 打包成可以雙擊開啟的 Mac app：npm run package
// 流程：vite build → 把 dist、electron、最小的 package.json 放進暫存資料夾 → electron-packager → release/經文結構分析-darwin-<arch>/經文結構分析.app
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { packager } from '@electron/packager';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const electronVersion = createRequire(import.meta.url)('electron/package.json').version;
const stage = path.join(root, 'release', '_stage');

execSync('npx vite build', { cwd: root, stdio: 'inherit' });
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(path.join(root, 'dist'), path.join(stage, 'dist'), { recursive: true });
cpSync(path.join(root, 'electron'), path.join(stage, 'electron'), {
  recursive: true,
  filter: (src) => !/-e2e\.cjs$|export-test\.cjs$/.test(src), // 開發用的測試腳本不放進 app
});
// 正式版不需要任何 node_modules：前端已經由 vite 打包好了
writeFileSync(
  path.join(stage, 'package.json'),
  JSON.stringify({ name: pkg.name, productName: '經文結構分析', version: pkg.version, description: pkg.description, main: 'electron/main.cjs' }, null, 2),
);

const out = await packager({
  dir: stage,
  out: path.join(root, 'release'),
  name: '經文結構分析',
  platform: 'darwin',
  arch: process.arch,
  electronVersion,
  icon: path.join(root, 'assets', 'icon.icns'),
  appBundleId: 'local.verse-analyser',
  appVersion: pkg.version,
  overwrite: true,
  prune: false,
  asar: true,
});
rmSync(stage, { recursive: true, force: true });
// Apple Silicon 的 Mac 要求執行檔有簽章；沒有開發者憑證時用「臨時簽章」（ad-hoc），重新簽一次整個 app 才會是有效的簽章
for (const dir of out) {
  const app = path.join(dir, '經文結構分析.app');
  execSync(`codesign --force --deep --sign - "${app}"`, { stdio: 'inherit' });
  execSync(`codesign --verify --deep --strict "${app}"`, { stdio: 'inherit' });
}
console.log('已輸出：', out.join('\n'));
