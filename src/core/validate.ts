import { findType } from './relations';
import type { Child, Doc, Seg, Settings } from './types';

/** 版面設定的合法範圍（設定對話框與驗證共用）。 */
export function validateSettings(s: Settings): string[] {
  const e: string[] = [];
  const num = (v: unknown, lo: number, hi: number, name: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) e.push(`${name}必須介於 ${lo} 到 ${hi}`);
  };
  if (s.page.orientation !== 'portrait' && s.page.orientation !== 'landscape') e.push('頁面方向不正確');
  s.page.margins.forEach((m, i) => num(m, 0, 60, `${['上', '右', '下', '左'][i]}邊界（mm）`));
  num(s.layoutScale, 0.3, 3, '版面縮放');
  num(s.main.size, 6, 36, '字級（pt）');
  num(s.indentStep, 1, 20, '每階縮排（mm）');
  num(s.treePadLeft ?? 0, 0, 80, '樹狀區左邊留白（mm）');
  if (typeof s.labelSeparator !== 'string' || s.labelSeparator.length > 3) e.push('標記分隔符最多 3 個字');
  const ids = new Set<string>();
  let sum = 0;
  for (const c of s.refColumns) {
    if (ids.has(c.id)) e.push(`對照欄 id 重複：${c.id}`);
    ids.add(c.id);
    num(c.width, 0.05, 0.5, '對照欄寬度');
    if (c.mode !== 'row' && c.mode !== 'verse') e.push('對照欄模式不正確');
    for (const [k, segs] of Object.entries(c.verses ?? {})) {
      if (!/^\d+:\d+$/.test(k)) e.push(`整節對照欄的經節「${k}」格式不正確`);
      if (!Array.isArray(segs)) e.push(`整節對照欄「${k}」的內容格式不正確`);
    }
    if (c.visible) sum += c.width;
  }
  if (sum > 0.7) e.push('開啟的對照欄加起來不能超過頁面寬度的 70%');
  return e;
}

/** §5.3。回傳錯誤訊息清單；空陣列表示通過。 */
export function validate(doc: Doc): string[] {
  const errs: string[] = [...validateSettings(doc.settings)];
  if (doc.meta.credits !== undefined && typeof doc.meta.credits !== 'string') errs.push('經文來源說明格式錯誤');
  if (doc.formatVersion !== 1) errs.push(`不認得的 formatVersion：${String(doc.formatVersion)}`);
  const ids = new Set<string>();
  const refIds = new Set(doc.settings.refColumns.map((c) => c.id));
  const dup = (id: string) => {
    if (ids.has(id)) errs.push(`id 重複：${id}`);
    ids.add(id);
  };

  const checkSegs = (segs: Seg[], where: string) => {
    for (const s of segs) {
      if (s.t === 'verse') {
        if (!Number.isInteger(s.c) || s.c < 1 || !Number.isInteger(s.v) || s.v < 1)
          errs.push(`${where}：經節標記的章、節必須是正整數`);
      } else if (s.t === 'text') {
        if (typeof s.text !== 'string' || !Array.isArray(s.marks)) errs.push(`${where}：文字片段格式錯誤`);
      } else errs.push(`${where}：未知的片段型別`);
    }
  };

  const walk = (list: Child[], parentRelIds: string[] | null, where: string) => {
    for (const c of list) {
      const keys = Object.keys(c.labels).sort();
      const want = (parentRelIds ?? []).slice().sort();
      if (JSON.stringify(keys) !== JSON.stringify(want))
        errs.push(`${where}：labels 的鍵必須剛好等於父括號的關係 id`);
      const it = c.item;
      dup(it.id);
      if (it.kind === 'row') {
        checkSegs(it.main, it.id);
        for (const k of Object.keys(it.refs)) {
          if (!refIds.has(k)) errs.push(`${it.id}：refs 的鍵 ${k} 沒有對應的對照欄`);
          checkSegs(it.refs[k], it.id);
        }
        if (!Number.isInteger(it.indent) || it.indent < 0 || it.indent > 12) errs.push(`${it.id}：縮排超出 0～12`);
      } else {
        if (it.children.length < 2) errs.push(`${it.id}：括號至少要有 2 個子項`);
        for (const r of it.relations) {
          dup(r.id);
          if (!findType(doc.relationTypes, r.type)) errs.push(`${it.id}：關係類型 ${r.type} 不在關係表中`);
        }
        for (const r of it.relations) {
          const type = findType(doc.relationTypes, r.type);
          if (!type) continue;
          const mains = it.children.filter((ch) => ch.labels[r.id]?.main).length;
          if (type.hasMain === 'no' && mains > 0) errs.push(`${it.id}：沒有主句的關係不能指定主句`);
          if (mains > 1) errs.push(`${it.id}：關係 ${r.id} 有多個主句`);
        }
        walk(it.children, it.relations.map((r) => r.id), it.id);
      }
    }
  };
  walk(doc.items, null, '最上層');
  return errs;
}
