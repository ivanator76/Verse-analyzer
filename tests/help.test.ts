import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const html = readFileSync(path.join(__dirname, '..', 'help.html'), 'utf8');
const sectionIds = [...html.matchAll(/<section id="([^"]+)" data-title="([^"]+)">/g)].map((m) => ({ id: m[1], title: m[2] }));

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

describe('使用說明（help.html）', () => {
  it('章節 id 不重複，每個章節都有標題', () => {
    const ids = sectionIds.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of sectionIds) expect(html).toContain(`<section id="${s.id}" data-title="${s.title}">\n  <h2>`);
    expect(sectionIds.length).toBeGreaterThanOrEqual(15);
  });

  it('app 裡所有連到說明的 topic 都有對應的章節', () => {
    const topics = new Set<string>();
    for (const f of walk(path.join(__dirname, '..', 'src')).filter((x) => /\.(tsx?|ts)$/.test(x))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<HelpLink topic="([^"]+)"/g)) topics.add(m[1]);
      for (const m of src.matchAll(/openHelp\('([^']+)'\)/g)) topics.add(m[1]);
    }
    expect(topics.size).toBeGreaterThan(0);
    const have = new Set(sectionIds.map((s) => s.id));
    for (const t of topics) expect(have.has(t), `說明裡沒有章節「${t}」`).toBe(true);
  });

  it('說明的 HTML 標籤是平衡的（沒有漏掉結尾）', () => {
    const body = html.replace(/<script>[\s\S]*<\/script>/, ''); // 程式碼裡的註解不算
    for (const tag of ['section', 'details', 'table', 'ul', 'ol', 'summary']) {
      const open = (body.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length;
      const close = (body.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
      expect(open, tag).toBe(close);
    }
  });

  it('說明裡寫到的功能、快捷鍵和程式實際提供的一致', () => {
    const app = readFileSync(path.join(__dirname, '..', 'src/ui/App.tsx'), 'utf8');
    // 快捷鍵：說明裡的每一個，程式裡都要有對應的處理
    const pairs: [string, RegExp][] = [
      ['⌘G', /k === 'g'/],
      ['⌘/', /e\.key === '\/'/],
      ['⌘,', /e\.key === ','/],
      ['⌘P', /k === 'p'/],
      ['⌘O', /k === 'o'/],
      ['⌥↑', /altKey && e\.key === 'ArrowUp'/],
      ['⌘]', /e\.key === '\]'/],
      ['⌘[', /e\.key === '\['/],
    ];
    for (const [key, re] of pairs) {
      expect(html, key).toContain(key);
      expect(re.test(app), `App.tsx 沒有處理 ${key}`).toBe(true);
    }
    // 說明裡提到的按鈕文字，在介面裡真的存在
    for (const label of ['建立括號', '解除括號', '刪除行', '版面設定…', '關係表…', '偏好設定…', '開啟備份…', '匯出 PDF', '標為經節', '與分析欄交換…', '取消經節辨識', '完成']) {
      const all = walk(path.join(__dirname, '..', 'src')).map((f) => readFileSync(f, 'utf8')).join('\n');
      expect(all.includes(label), `介面裡找不到按鈕「${label}」`).toBe(true);
    }
  });
});
