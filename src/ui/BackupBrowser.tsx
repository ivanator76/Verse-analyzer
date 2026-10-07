import { useEffect, useMemo, useState } from 'react';
import { HelpLink } from './HelpLink';
import { findIncomplete } from '../core/commands';
import { parseDoc } from '../core/file';
import { rowsInOrder, segsText } from '../core/tree';
import type { Doc } from '../core/types';
import type { BackupGroup, BackupVersion } from './files';

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

interface Preview {
  doc?: Doc;
  errors?: string[];
}

/**
 * §10「開啟備份…」：依原檔分組瀏覽每次存檔前留下的舊版（每個檔案最近 20 版），
 * 先預覽內容，再選擇「開成新文件」或「取代目前文件內容」（可以用 ⌘Z 復原）。
 */
export function BackupBrowser({
  currentPath,
  onOpenCopy,
  onReplace,
  onClose,
}: {
  currentPath: string | null;
  onOpenCopy(doc: Doc): void;
  onReplace(doc: Doc): void;
  onClose(): void;
}) {
  const [groups, setGroups] = useState<BackupGroup[] | null>(null);
  const [gi, setGi] = useState(0);
  const [sel, setSel] = useState<BackupVersion | null>(null);
  const [prev, setPrev] = useState<Preview | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    window.api!
      .listBackups(currentPath)
      .then((g) => {
        setGroups(g);
        setSel(g[0]?.versions[0] ?? null);
      })
      .catch((e) => setErr(String(e)));
  }, [currentPath]);

  const group = groups?.[gi];

  useEffect(() => {
    if (!sel) return setPrev(null);
    let live = true;
    window.api!
      .readBackup(sel.path)
      .then((text) => {
        if (!live) return;
        const r = parseDoc(text);
        setPrev('doc' in r ? { doc: r.doc } : { errors: r.errors });
      })
      .catch((e) => live && setPrev({ errors: [String(e)] }));
    return () => {
      live = false;
    };
  }, [sel]);

  const summary = useMemo(() => {
    if (!prev?.doc) return null;
    const rows = rowsInOrder(prev.doc);
    const inc = findIncomplete(prev.doc);
    let brackets = 0;
    const walk = (l: Doc['items']) => l.forEach((c) => c.item.kind === 'bracket' && (brackets++, walk(c.item.children)));
    walk(prev.doc.items);
    return {
      rows: rows.length,
      brackets,
      incomplete: inc.unassignedBrackets.length + inc.pendingLabels.length + inc.missingMain.length,
      lines: rows.map((r) => segsText(r.main).trim()).filter(Boolean).slice(0, 12),
    };
  }, [prev]);

  return (
    <div className="modal-back screen-only" onMouseDown={onClose}>
      <div className="modal wide backups" onMouseDown={(e) => e.stopPropagation()}>
        <h3>開啟備份 <HelpLink topic="files" /></h3>
        {err && <p className="errs">{err}</p>}
        {groups && groups.length === 0 && <p className="hint">還沒有任何備份。每次存檔前，舊版會自動備份在這裡（每個檔案保留最近 20 版）。</p>}
        {groups && groups.length > 0 && (
          <div className="bk-body">
            <div className="bk-left">
              <select value={gi} onChange={(e) => { const i = Number(e.target.value); setGi(i); setSel(groups[i].versions[0]); }}>
                {groups.map((g, i) => (
                  <option key={g.key} value={i}>{g.current ? '★ ' : ''}{g.label}（{g.versions.length} 版）</option>
                ))}
              </select>
              {group?.origin && <div className="hint" title={group.origin}>{group.origin}</div>}
              <ul className="bk-list">
                {group?.versions.map((v) => (
                  <li key={v.path} className={sel?.path === v.path ? 'on' : undefined} onClick={() => setSel(v)}>
                    {new Date(v.savedAt).toLocaleString()}
                    <small>{kb(v.size)}</small>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bk-right">
              {prev?.errors && (
                <>
                  <p className="errs">這份備份有問題，不能開啟：</p>
                  <ul className="errs">{prev.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul>
                </>
              )}
              {prev?.doc && summary && (
                <>
                  <b>{prev.doc.meta.title}</b>
                  <p className="hint">
                    {summary.rows} 行・{summary.brackets} 個括號・未完成項目 {summary.incomplete}
                  </p>
                  <ol className="bk-lines">{summary.lines.map((l, i) => <li key={i}>{l}</li>)}</ol>
                  {summary.rows > summary.lines.length && <p className="hint">…</p>}
                </>
              )}
            </div>
          </div>
        )}
        <div className="modal-buttons">
          {sel && <button onClick={() => void window.api!.revealBackup(sel.path)}>在 Finder 顯示</button>}
          <button disabled={!prev?.doc} onClick={() => (onClose(), onOpenCopy(prev!.doc!))}>開成新文件（副本）</button>
          <button className="primary" disabled={!prev?.doc} title="用這個版本取代目前文件的內容；可以用 ⌘Z 復原" onClick={() => (onClose(), onReplace(prev!.doc!))}>取代目前文件內容</button>
          <button onClick={onClose}>關閉</button>
        </div>
      </div>
    </div>
  );
}
