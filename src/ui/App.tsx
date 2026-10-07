import '@fontsource/gentium-plus/400.css';
import '@fontsource/gentium-plus/700.css';
import '@fontsource/gentium-plus/400-italic.css';
import '@fontsource/gentium-plus/700-italic.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { T } from '../core/builder';
import * as C from '../core/commands';
import { createDoc } from '../core/doc';
import * as H from '../core/history';
import { computeLayout, GUTTER } from '../core/layout';
import { sampleJohn3, stressDoc } from '../core/sample';
import { rowsInOrder } from '../core/tree';
import type { Doc } from '../core/types';
import { CellEditor, type EditorHandlers, type FocusReq } from './Editor';
import { cellFont, domMeasurer, fontStack, LABEL_PT, LINE_HEIGHT } from './measure';
import { offsetToPos, segsSize } from './pm';
import { Segs } from './segs';
import { k } from './keys';
import { LayoutSettings } from './LayoutSettings';
import { langName } from '../core/fonts';
import { BackupBrowser } from './BackupBrowser';
import { BibleImport } from './BibleImport';
import { BibleToColumn } from './BibleToColumn';
import { dropLevels } from '../core/drop';
import { RefPastePreview } from './RefPastePreview';
import { verseKeys } from '../core/verseblocks';
import { RelationTableEditor } from './RelationTableEditor';
import type { Seg } from '../core/types';
import { getPrefs, getRelationTypes, resetPrefs, savePrefs, subscribePrefs } from './prefs';
import { PrefsDialog } from './PrefsDialog';
import { preflight, type Issue } from '../core/preflight';
import { detectVerses, plainLines } from '../core/detect';
import { verseBefore } from '../core/verses';
import { schema } from './pm';
import { applyMark, type MarkAction } from './marks';
import { getActiveCol, getActiveRowId, getActiveView, getView } from './Editor';
import type { EditorView } from 'prosemirror-view';
import { VerseEditor } from './VerseEditor';
import { parseDoc, serialize } from '../core/file';
import { firstRow, locate, segsText } from '../core/tree';
import type { Bracket } from '../core/types';
import { browserApi, hasNative, openHelp, recovery, type RecoveryEntry } from './files';
import { Modal, type ModalSpec } from './Modal';
import { RelationPanel } from './RelationPanel';

function blankDoc(): Doc {
  // 新文件：複製全域關係表與偏好設定裡的預設版面（之後偏好設定怎麼改，舊文件都不受影響）
  return createDoc('未命名', getRelationTypes(), getPrefs().newDoc);
}

// 公開的網頁版（npm run build:public）不含範例文件
const PUBLIC = import.meta.env.VITE_PUBLIC === '1';

// 頁面之間不留縫：printToPDF 不一定會觸發 beforeprint，位置不能依賴列印狀態。換頁用虛線標示。
const GAP_MM = 0;

export function App() {
  const [source, setSource] = useState<'sample' | 'blank' | 'stress'>(PUBLIC ? 'blank' : 'sample');
  const [h, setHState] = useState(() => H.createHistory(PUBLIC ? blankDoc() : sampleJohn3()));
  const hRef = useRef(h);
  const setH = (n: H.History) => {
    hRef.current = n;
    setHState(n);
  };
  const curSel = useRef<H.Sel | null>(null);
  const composing = useRef(false);
  const [focus, setFocus] = useState<FocusReq | null>(null);
  const nonce = useRef(0);
  const [notice, setNotice] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(true);
  const [zoom, setZoomState] = useState(() => getPrefs().viewZoom);
  const setZoom = (z: number) => {
    setZoomState(z);
    void savePrefs({ viewZoom: z }); // 檢視縮放存在 app 偏好設定，不影響文件（§9.4）
  };
  const [prefsDlg, setPrefsDlg] = useState(false);
  const [defaultsDlg, setDefaultsDlg] = useState(false);
  const [prefsTick, setPrefsTick] = useState(0);
  useEffect(() => subscribePrefs(() => { setPrefsTick((n) => n + 1); setZoomState(getPrefs().viewZoom); }), []);
  const [layoutDlg, setLayoutDlg] = useState(false);
  const [relDlg, setRelDlg] = useState(false);
  const [backupDlg, setBackupDlg] = useState(false);
  const [bibleDlg, setBibleDlg] = useState(false);
  const [webNote, setWebNote] = useState(() => !hasNative() && localStorage.getItem('webNoteDismissed') !== '1');
  const [bibleColDlg, setBibleColDlg] = useState(false);
  const [longEdit, setLongEdit] = useState<{ rowId: string; col: string } | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const selAnchor = useRef<string | null>(null);
  const [modal, setModal] = useState<ModalSpec | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const docId = useRef(`d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
  const actions = useRef<Record<string, () => void>>({});
  const markRef = useRef<((a: MarkAction) => void) | undefined>(undefined);
  const [pasteInfo, setPasteInfo] = useState<{ doc: Doc; count: number; rowId: string; offset: number; raw: string[] } | null>(null);
  const [refPaste, setRefPaste] = useState<{ rowId: string; col: string; text: string } | null>(null);
  const [verseEdit, setVerseEdit] = useState<{ rowId: string; pos: number; c: number; v: number; shown: boolean } | null>(null);

  const addLog = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${s}`, ...l].slice(0, 14));

  useEffect(() => {
    Promise.all([
      document.fonts.load('12pt "Gentium Plus"', 'Καὶ καθὼς ἐρήμῳ abc'),
      document.fonts.load('bold 12pt "Gentium Plus"', 'Καὶ abc'),
      document.fonts.load('italic 12pt "Gentium Plus"', 'Καὶ abc'),
    ]).then(() => document.fonts.ready).then(() => setFontsReady(true));
    const on = (e: Event) => {
      composing.current = e.type === 'compositionstart' || e.type === 'compositionupdate';
      if (e.type !== 'compositionupdate') addLog(`${e.type}${'data' in e ? `「${(e as CompositionEvent).data}」` : ''}`);
    };
    for (const t of ['compositionstart', 'compositionend']) document.addEventListener(t, on, true);
    const bp = () => setPrinting(true);
    const ap = () => setPrinting(false);
    window.addEventListener('beforeprint', bp);
    window.addEventListener('afterprint', ap);
    return () => {
      for (const t of ['compositionstart', 'compositionend']) document.removeEventListener(t, on, true);
      window.removeEventListener('beforeprint', bp);
      window.removeEventListener('afterprint', ap);
    };
  }, []);

  const doc = h.present;
  const landscape = doc.settings.page.orientation === 'landscape';

  useEffect(() => {
    document.title = `${h.present.meta.title}${H.isDirty(h) ? ' — 已編輯' : ''}`;
    let el = document.getElementById('page-style') as HTMLStyleElement | null;
    if (!el) (el = document.createElement('style')), (el.id = 'page-style'), document.head.appendChild(el);
    el.textContent = `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 0; }`;
  });

  const layout = useMemo(() => {
    if (!fontsReady) return null;
    const m = domMeasurer(doc);
    try {
      return computeLayout(doc, m);
    } finally {
      m.dispose();
    }
  }, [doc, fontsReady]);

  // ───────── 指令 ─────────
  const requestFocus = (rowId: string, offset: number, col = 'main') => setFocus({ rowId, col, offset, nonce: ++nonce.current });

  const run = (res: C.Result, focusAfter?: (d: Doc) => { rowId: string; offset: number; col?: string } | null) => {
    if ('error' in res) return setNotice(res.error), false;
    setH(H.push(hRef.current, res.doc, curSel.current));
    setNotice(res.notices.join('；'));
    const f = focusAfter?.(res.doc);
    if (f) requestFocus(f.rowId, f.offset, f.col);
    return true;
  };

  const handlers: EditorHandlers = useMemo(() => {
    const cur = () => hRef.current.present;
    const rowOf = (id: string) => rowsInOrder(cur()).find((r) => r.id === id)!;
    const neighbor = (id: string, d: -1 | 1) => rowsInOrder(cur())[rowsInOrder(cur()).findIndex((r) => r.id === id) + d];
    const undoRedo = (kind: 'undo' | 'redo') => {
      if (composing.current) return; // 組字中不作用（§3.2）
      const r = (kind === 'undo' ? H.undo : H.redo)(hRef.current, curSel.current);
      if (!r) return;
      setH(r.h);
      const rows = rowsInOrder(r.h.present);
      const target = r.sel && (r.sel.rowId.startsWith('v:') || rows.some((x) => x.id === r.sel!.rowId)) ? r.sel : { rowId: rows[0].id, offset: 0, col: 'main' };
      const col = target.col && r.h.present.settings.refColumns.some((c) => c.id === target.col && c.visible) ? target.col : 'main';
      requestFocus(target.rowId, target.offset, col);
    };
    return {
      onText(rowId, col, segs, isComposing) {
        const res = rowId.startsWith('v:') ? C.setVerseText(cur(), col, rowId.slice(2), segs) : C.editCellText(cur(), rowId, col, segs);
        if ('error' in res) return;
        setH(H.pushTyping(hRef.current, res.doc, `${rowId}|${col}`, curSel.current, Date.now(), isComposing));
        setNotice('');
      },
      onSelection(rowId, col, offset, docChanged) {
        if (!docChanged && !composing.current) setH(H.closeGroup(hRef.current));
        curSel.current = { rowId, col, offset };
      },
      onCompositionEnd() {
        composing.current = false;
        setH(H.touchGroup(hRef.current, Date.now()));
      },
      onPaste(rowId, col, offset, text) {
        // 貼到對照欄：一律先顯示預覽對話框，不會直接覆蓋（§8）
        if (col !== 'main') {
          setRefPaste({ rowId, col, text });
          return;
        }
        const raw = text.replace(/\r\n?/g, '\n').split('\n');
        const det = detectVerses(raw, cur().meta.startChapter);
        const pos = offsetToPos(rowOf(rowId).main, offset);
        const ok = run(C.pasteLines(cur(), rowId, pos, det.lines), (d) => {
          const rows = rowsInOrder(d);
          const i = rows.findIndex((r) => r.id === rowId);
          const last = rows[i + raw.length - 1];
          const size = segsSize(last.main);
          // 游標放在貼上內容的結尾（游標後原本的文字之前）
          const tail = segsSize(rowOf(rowId).main) - offset;
          return { rowId: last.id, offset: size - tail };
        });
        if (ok && det.count > 0) {
          setPasteInfo({ doc: hRef.current.present, count: det.count, rowId, offset, raw });
          setNotice(`辨識出 ${det.count} 個經節`);
        } else setPasteInfo(null);
      },
      onVerseClick(rowId, nodePos) {
        const node = getView(rowId)?.state.doc.nodeAt(nodePos);
        if (node && node.type.name === 'verse') setVerseEdit({ rowId, pos: nodePos, c: node.attrs.c, v: node.attrs.v, shown: node.attrs.shown });
      },
      onKey(e, rowId, col, offset, atStart, atEnd) {
        const mod = e.metaKey || e.ctrlKey;
        const k = e.key;
        if (mod && k.toLowerCase() === 'z') return undoRedo(e.shiftKey ? 'redo' : 'undo'), true;
        if (mod && k.toLowerCase() === 'y') return undoRedo('redo'), true;
        if (mod && !e.shiftKey && ['b', 'i', 'u'].includes(k.toLowerCase())) return markRef.current?.(k.toLowerCase() as MarkAction), true;
        if (mod && k.toLowerCase() === 's') {
          setH(H.markSaved(hRef.current));
          setNotice('已儲存（原型：只記錄「已儲存的位置」，尚未寫入檔案）');
          return true;
        }
        if (k === 'Enter' && mod) return run(C.togglePageBreak(cur(), rowId)), true;
        if (rowId.startsWith('v:')) {
          // 整節對照欄的儲存格：Enter／Tab／方向鍵在經節之間移動
          const keys = verseKeys(cur());
          const i = keys.indexOf(rowId.slice(2));
          const goto = (j: number, off: 'start' | 'end') => {
            const k = keys[j];
            if (k === undefined) return false;
            requestFocus(`v:${k}`, off === 'end' ? segsSize(cur().settings.refColumns.find((c) => c.id === col)?.verses?.[k] ?? []) : 0, col);
            return true;
          };
          if (k === 'Enter' || (k === 'Tab' && !e.shiftKey) || (k === 'ArrowDown' && atEnd)) return goto(i + 1, 'start');
          if ((k === 'Tab' && e.shiftKey) || (k === 'ArrowUp' && atStart)) return goto(i - 1, 'end');
          return false;
        }
        if (col !== 'main') {
          // 對照欄的格子：Enter／Tab／方向鍵在格子之間移動；其餘交給編輯器
          const rows = rowsInOrder(cur());
          const i = rows.findIndex((r) => r.id === rowId);
          const cols = ['main', ...cur().settings.refColumns.filter((c) => c.visible).map((c) => c.id)];
          const goto = (ri: number, c: string, off: 'start' | 'end') => {
            const r = rows[ri];
            if (!r) return false;
            requestFocus(r.id, off === 'end' ? segsSize(c === 'main' ? r.main : r.refs[c] ?? []) : 0, c);
            return true;
          };
          if (k === 'Enter') return goto(i + 1, col, 'start');
          if (k === 'Tab') {
            const ci = cols.indexOf(col) + (e.shiftKey ? -1 : 1);
            if (ci >= 0 && ci < cols.length) return goto(i, cols[ci], 'start');
            return e.shiftKey ? goto(i - 1, cols[cols.length - 1], 'start') : goto(i + 1, cols[0], 'start');
          }
          if (k === 'ArrowUp' && atStart) return goto(i - 1, col, 'end');
          if (k === 'ArrowDown' && atEnd) return goto(i + 1, col, 'start');
          return false;
        }
        if (k === 'Enter') {
          const pos = offsetToPos(rowOf(rowId).main, offset);
          run(C.splitRow(cur(), rowId, pos), (d) => {
            const rows = rowsInOrder(d);
            return { rowId: rows[rows.findIndex((r) => r.id === rowId) + 1].id, offset: 0 };
          });
          return true;
        }
        if (k === 'Backspace' && atStart && !mod) {
          const prev = neighbor(rowId, -1);
          if (!prev) return true;
          run(C.mergeWithPrev(cur(), rowId), () => ({ rowId: prev.id, offset: segsSize(prev.main) }));
          return true;
        }
        if (k === 'Delete' && atEnd) {
          const next = neighbor(rowId, 1);
          if (!next) return true;
          run(C.mergeWithNext(cur(), rowId), () => ({ rowId, offset: segsSize(rowOf(rowId).main) }));
          return true;
        }
        if (k === 'Tab') {
          run(C.indentRows(cur(), [rowId], e.shiftKey ? -1 : 1), () => ({ rowId, offset }));
          return true;
        }
        if (k === 'ArrowUp' && atStart) {
          const p = neighbor(rowId, -1);
          if (p) requestFocus(p.id, segsSize(p.main));
          return !!p;
        }
        if (k === 'ArrowDown' && atEnd) {
          const n = neighbor(rowId, 1);
          if (n) requestFocus(n.id, 0);
          return !!n;
        }
        return false;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ───────── 檔案（§10） ─────────
  const loadDoc = (d: Doc, path: string | null, fromFile = false) => {
    if (!fromFile) browserApi.forgetFile(); // 新文件不是同一個檔案，下次存檔要重新選位置（網頁版）
    setH(H.createHistory(d));
    setFilePath(path);
    setSel([]);
    setNotice('');
    docId.current = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    requestFocus(rowsInOrder(d)[0].id, 0);
  };

  const confirmDiscard = (then: () => void) => {
    if (!H.isDirty(hRef.current)) return then();
    setModal({
      title: '這份文件有尚未儲存的變更',
      buttons: [
        { label: '儲存', primary: true, onClick: () => void save(false).then((ok) => ok && then()) },
        {
          label: '不儲存',
          onClick: () => {
            void recovery.delete(docId.current);
            then();
          },
        },
      ],
    });
  };

  const showErrors = (title: string, errors: string[]) =>
    setModal({ title, body: <ul>{errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}</ul>, buttons: [] });

  /** 存檔：先驗證；失敗表示 app 有錯，不覆蓋原檔，改存復原檔。 */
  const save = async (as: boolean): Promise<boolean> => {
    let cur = H.closeGroup(hRef.current);
    const doc0 = cur.present;
    const errs = (await import('../core/validate')).validate(doc0);
    const text = serialize(doc0);
    if (errs.length) {
      await recovery.write({ id: docId.current, path: filePathRef.current, text });
      showErrors('存檔前驗證失敗（這是 app 的錯誤）。原檔沒有被覆蓋，內容已存到復原資料夾。', errs);
      return false;
    }
    const name = doc0.meta.title || '未命名';
    const path = hasNative()
      ? await window.api!.saveFile({ path: as ? null : filePathRef.current, text, suggestedName: name })
      : await browserApi.saveFile({ text, suggestedName: name, saveAs: as });
    if (!path) return false;
    cur = H.markSaved(cur);
    setH(cur);
    setFilePath(path);
    await recovery.delete(docId.current);
    setNotice(`已儲存：${path}`);
    return true;
  };

  const openFile = () =>
    confirmDiscard(async () => {
      try {
        const r = hasNative() ? await window.api!.openFile() : await browserApi.openFile();
        if (!r) return;
        const parsed = parseDoc(r.text);
        if ('errors' in parsed) return showErrors('這個檔案有問題，沒有開啟（原檔沒有被改動）：', parsed.errors);
        loadDoc(parsed.doc, r.path, true);
        setNotice(r.path ? `已開啟：${r.path}` : '已開啟檔案');
      } catch (e) {
        showErrors('開啟檔案時發生錯誤：', [String(e)]); // 不要讓錯誤悄悄消失
      }
    });

  const newDoc = (d: Doc) => confirmDiscard(() => loadDoc(d, null));

  // 自動存檔、已編輯狀態通知、關閉時的儲存請求、啟動時的復原詢問
  useEffect(() => {
    window.api?.setDirty({ dirty: H.isDirty(h), id: docId.current });
  }, [h.present, h.saved]);
  useEffect(() => {
    const t = setInterval(() => {
      const cur = hRef.current;
      if (H.isDirty(cur)) void recovery.write({ id: docId.current, path: filePathRef.current, text: serialize(cur.present) });
    }, getPrefs().autosaveSeconds * 1000);
    return () => clearInterval(t);
  }, [prefsTick]);
  useEffect(() => {
    window.api?.onRequestSave(() => void actions.current.saveForClose?.());
    void recovery.list().then((list) => list[0] && askRecover(list, 0));
    // 網頁版：關掉或重新整理分頁前，有未存的變更會先跳出瀏覽器的確認
    if (hasNative()) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (H.isDirty(hRef.current)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const filePathRef = useRef<string | null>(null);
  filePathRef.current = filePath;

  const askRecover = (list: RecoveryEntry[], i: number) => {
    const e = list[i];
    if (!e) return;
    const next = () => askRecover(list, i + 1);
    setModal({
      title: '偵測到上次沒有儲存的內容',
      body: (
        <p>
          {e.path ?? '（尚未存過的新文件）'}，最後自動存檔於 {new Date(e.savedAt).toLocaleString()}。
          {e.originalNewer && <b style={{ color: '#b00020' }}>　注意：原檔比這份復原檔更新，恢復會用較舊的內容。</b>}
        </p>
      ),
      buttons: [
        {
          label: '恢復',
          primary: true,
          onClick: () => {
            const parsed = parseDoc(e.text);
            if ('errors' in parsed) return showErrors('復原檔有問題，無法恢復：', parsed.errors);
            loadDoc(parsed.doc, e.path);
            docId.current = e.id; // 復原檔保留，直到存檔或選「不儲存」
            setH(H.push(H.createHistory(parsed.doc), { ...parsed.doc }, null)); // 標成「已編輯」
          },
        },
        {
          label: '捨棄',
          onClick: () =>
            setModal({
              title: '確定要捨棄這份復原檔嗎？',
              buttons: [{ label: '確定捨棄', onClick: () => void recovery.delete(e.id).then(next) }],
            }),
        },
        { label: '稍後', onClick: next },
      ],
    });
  };

  // ───────── 選取與括號操作 ─────────
  // ───────── 拖曳（移動行或括號） ─────────
  // 拖左側的行號（可多選）或括號的垂直線。指標停在某一行的上緣／下緣時，用指標的水平位置在
  // 「那一行自己」和「包著它的括號」之間挑一層（越靠左越外層）；放開就是一個復原步驟。
  interface DragTarget { anchorId: string; side: 'before' | 'after'; lineX: number; lineY: number; right: number }
  const dragStart = useRef<{ ids: string[]; x: number; y: number; active: boolean } | null>(null);
  const dragTarget = useRef<DragTarget | null>(null);
  const [drag, setDrag] = useState<{ n: number; x: number; y: number; target: DragTarget | null } | null>(null);

  const computeDropTarget = (cx: number, cy: number, ids: string[]): DragTarget | null => {
    const rowEls = [...document.querySelectorAll<HTMLElement>('.sheet .row[data-rowid]')];
    if (!rowEls.length) return null;
    let best: { el: HTMLElement; r: DOMRect; d: number } | null = null;
    for (const el of rowEls) {
      const r = el.getBoundingClientRect();
      const d = cy < r.top ? r.top - cy : cy > r.bottom ? cy - r.bottom : 0;
      if (!best || d < best.d) best = { el, r, d };
    }
    if (!best) return null;
    const side: 'before' | 'after' = cy < (best.r.top + best.r.bottom) / 2 ? 'before' : 'after';
    const rowId = best.el.dataset.rowid!;
    const levels = dropLevels(hRef.current.present, rowId, side, ids);
    if (!levels.length) return null;
    const xOf = (l: (typeof levels)[number]): number => {
      if (l.kind === 'row') return document.querySelector(`.editor[data-row="${l.anchorId}"][data-col="main"]`)?.getBoundingClientRect().left ?? best!.r.left;
      const lines = [...document.querySelectorAll<SVGElement>(`.hit[data-bracket="${l.anchorId}"]`)].map((e) => e.getBoundingClientRect());
      if (!lines.length) return best!.r.left;
      const mid = (best!.r.top + best!.r.bottom) / 2;
      lines.sort((a, b) => Math.abs((a.top + a.bottom) / 2 - mid) - Math.abs((b.top + b.bottom) / 2 - mid));
      return lines[0].left;
    };
    let pick = levels[0];
    let pickD = Infinity;
    for (const l of levels) {
      const d = Math.abs(cx - xOf(l));
      if (d < pickD) (pickD = d), (pick = l);
    }
    return { anchorId: pick.anchorId, side, lineX: xOf(pick), lineY: side === 'before' ? best.r.top : best.r.bottom, right: best.r.right };
  };

  useEffect(() => {
    const finish = (apply: boolean) => {
      const st = dragStart.current;
      dragStart.current = null;
      document.body.classList.remove('dragging');
      const t = dragTarget.current;
      dragTarget.current = null;
      setDrag(null);
      if (!st?.active || !apply || !t) return;
      if (run(C.moveItemsTo(hRef.current.present, st.ids, { anchorId: t.anchorId, side: t.side }))) setSel(st.ids);
    };
    const move = (e: MouseEvent) => {
      const st = dragStart.current;
      if (!st) return;
      if (!st.active) {
        if (Math.hypot(e.clientX - st.x, e.clientY - st.y) < 5) return;
        st.active = true;
        document.body.classList.add('dragging');
      }
      const t = computeDropTarget(e.clientX, e.clientY, st.ids);
      dragTarget.current = t;
      setDrag({ n: st.ids.length, x: e.clientX, y: e.clientY, target: t });
      if (e.clientY < 90) window.scrollBy(0, -18); // 拖到視窗邊緣時自動捲動
      else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 18);
    };
    const up = () => finish(true);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && dragStart.current?.active && finish(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('keydown', key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const order = rowsInOrder(hRef.current.present).map((r) => r.id);
    if (e.shiftKey && selAnchor.current && order.includes(selAnchor.current)) {
      const a = order.indexOf(selAnchor.current);
      const b = order.indexOf(id);
      setSel(order.slice(Math.min(a, b), Math.max(a, b) + 1));
    } else if (e.metaKey || e.ctrlKey) {
      setSel((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
      selAnchor.current = id;
    } else {
      setSel([id]);
      selAnchor.current = id;
    }
    if (!e.shiftKey && !e.metaKey && !e.ctrlKey) dragStart.current = { ids: sel.includes(id) ? sel : [id], x: e.clientX, y: e.clientY, active: false };
  };

  const effIds = (): string[] => (sel.length ? sel : curSel.current ? [curSel.current.rowId] : []);

  const chain = (doc: Doc, steps: ((d: Doc) => C.Result)[]): C.Result => {
    let d = doc;
    const notices: string[] = [];
    for (const f of steps) {
      const r = f(d);
      if ('error' in r) return r;
      d = r.doc;
      notices.push(...r.notices);
    }
    return { doc: d, notices };
  };

  // ───────── 文字標記與經節標記（作用在目前有游標的格子） ─────────
  const viaView = (fn: (v: EditorView, rowId: string) => void, rowId?: string) => {
    const id = rowId ?? getActiveRowId();
    const v = rowId ? getView(rowId) : getActiveView();
    if (!v || !id) return setNotice('請先點進要編輯的文字');
    setH(H.closeGroup(hRef.current)); // 一次操作＝一個復原步驟
    fn(v, id);
    setH(H.closeGroup(hRef.current));
    v.focus();
  };
  const doMark = (a: MarkAction) => viaView((v) => void applyMark(v, a));
  markRef.current = doMark;
  const markAsVerse = () =>
    viaView((v, rowId) => {
      if (getActiveCol() !== 'main') return setNotice('經節標記只能放在分析欄');
      const { from, to } = v.state.selection;
      const t = v.state.doc.textBetween(from, to);
      if (!/^\d{1,3}$/.test(t)) return setNotice('請先選取一個數字（例如 16），再按「標為經節」');
      const before = verseBefore(hRef.current.present, rowId, from - 1);
      v.dispatch(v.state.tr.replaceSelectionWith(schema.nodes.verse.create({ c: before?.c ?? hRef.current.present.meta.startChapter, v: Number(t), shown: true })));
    });
  const cancelDetect = () => {
    const info = pasteInfo;
    if (!info || hRef.current.present !== info.doc) return;
    const r = H.undo(hRef.current, curSel.current);
    if (!r) return;
    const row = rowsInOrder(r.h.present).find((x) => x.id === info.rowId)!;
    const res = C.pasteLines(r.h.present, info.rowId, offsetToPos(row.main, info.offset), plainLines(info.raw));
    if ('error' in res) return;
    setH(H.push(r.h, res.doc, r.sel)); // 只取消辨識，貼上的文字保留；仍然是一個步驟
    setPasteInfo(null);
    setNotice('已取消經節辨識，貼上的文字保留');
  };

  const doDissolve = () => {
    const doc0 = hRef.current.present;
    const id = sel.length === 1 ? sel[0] : null;
    const loc = id ? locate(doc0, id) : null;
    const slot = loc?.list[loc.index];
    if (!id || !slot || slot.item.kind !== 'bracket') return setNotice('請先點選一個括號的垂直線');
    const b = slot.item as Bracket;
    const rels = loc!.parent?.relations ?? [];
    const labeled = rels.some((r) => slot.labels[r.id] && !slot.labels[r.id].pending);
    if (!labeled) return void run(C.dissolveBracket(doc0, id));
    setModal({
      title: '這個括號在父括號裡有標記：標記要交給誰？',
      body: <p style={{ fontSize: 13 }}>其他子項會變成「待判定」。</p>,
      buttons: [
        ...b.children.map((c) => ({
          label: segsText(c.item.kind === 'row' ? c.item.main : []).trim().slice(0, 16) || '［括號］',
          onClick: () => void run(C.dissolveBracket(hRef.current.present, id, { mode: 'give', childId: c.item.id })),
        })),
        { label: '全部標成待判定', onClick: () => void run(C.dissolveBracket(hRef.current.present, id, { mode: 'allPending' })) },
      ],
    });
    setSel([]);
  };

  const doDelete = () => {
    const ids = sel.filter((id) => rowsInOrder(hRef.current.present).some((r) => r.id === id));
    if (!ids.length) return setNotice('請先在左側選取要刪除的行');
    const rows = rowsInOrder(hRef.current.present).filter((r) => ids.includes(r.id));
    const hasRefs = rows.some((r) => Object.values(r.refs).some((x) => segsText(x).trim() !== ''));
    const go = (policy: C.RefPolicy) => {
      if (run(C.deleteRows(hRef.current.present, ids, policy))) setSel([]);
    };
    if (!hasRefs) return go('delete');
    setModal({
      title: '這些行的對照欄有內容',
      buttons: [
        { label: '一併刪除', onClick: () => go('delete') },
        { label: '併入上一行', primary: true, onClick: () => go('merge-prev') },
      ],
    });
  };

  const moveSel = (dir: -1 | 1) => {
    const ids = effIds();
    const order = rowsInOrder(hRef.current.present).map((r) => r.id);
    const sorted = [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    run(chain(hRef.current.present, (dir === -1 ? sorted : sorted.reverse()).map((id) => (d: Doc) => C.moveItem(d, id, dir))));
  };

  actions.current = {
    create: () => void run(C.createBracket(hRef.current.present, effIds())),
    dissolve: doDissolve,
    up: () => moveSel(-1),
    down: () => moveSel(1),
    into: () => void run(C.moveIntoSibling(hRef.current.present, effIds()[0], 'next')),
    intoPrev: () => void run(C.moveIntoSibling(hRef.current.present, effIds()[0], 'prev')),
    out: () => void run(C.moveOutOfBracket(hRef.current.present, effIds()[0])),
    del: doDelete,
    save: () => void save(false),
    saveForClose: async () => window.api?.saveResult(await save(false)),
    open: () => openFile(),
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (composing.current || e.isComposing || e.keyCode === 229) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const inEditor = !!(e.target as HTMLElement).closest?.('.ProseMirror');
      let a: string | null = null;
      if (mod && k === 'g') a = e.shiftKey ? 'dissolve' : 'create';
      else if (e.altKey && e.key === 'ArrowUp') a = 'up';
      else if (e.altKey && e.key === 'ArrowDown') a = 'down';
      else if (mod && e.key === ']') a = e.shiftKey ? 'intoPrev' : 'into';
      else if (mod && e.key === '[') a = 'out';
      else if (mod && k === 'o') a = 'open';
      else if (mod && k === 'p') a = 'print';
      else if (e.key === 'Escape' && !dragStart.current?.active && !document.querySelector('.modal-back, .longedit') && !(e.target as HTMLElement).closest?.('.ProseMirror, input, select, textarea')) {
        setSel([]);
        return;
      }
      else if (mod && e.key === ',') a = 'prefs';
      else if (mod && e.key === '/') a = 'help';
      else if (mod && k === 's' && !inEditor) a = 'save';
      else if ((e.key === 'Delete' || e.key === 'Backspace') && !inEditor && sel.length && !(e.target as HTMLElement).closest?.('input,select,textarea')) a = 'del';
      if (!a) return;
      e.preventDefault();
      actions.current[a]?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);

  const switchSource = (s: 'sample' | 'blank' | 'stress') => {
    setSource(s);
    newDoc(PUBLIC || s === 'blank' ? blankDoc() : s === 'sample' ? sampleJohn3() : stressDoc(2)); // 公開版沒有範例，整段會在建置時被拿掉
  };

  // 字型載入完成後，自動把游標放進第一行，可以直接打字
  const autoFocused = useRef(false);
  useEffect(() => {
    if (layout && !autoFocused.current) {
      autoFocused.current = true;
      requestFocus(rowsInOrder(hRef.current.present)[0].id, 0);
    }
  }, [layout]);

  // 點到頁面上沒有文字的地方：把游標放進最近的一行
  const clickSheet = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.ProseMirror')) return;
    const els = [...document.querySelectorAll<HTMLElement>('.sheet .row[data-rowid]')]; // 跨頁列只有第一段有 data-rowid
    if (!els.length || !layout) return;
    let best = 0;
    let bestD = Infinity;
    els.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
      if (d < bestD) (bestD = d), (best = i);
    });
    e.preventDefault();
    const id = els[best].dataset.rowid!;
    const target = rowsInOrder(hRef.current.present).find((r) => r.id === id);
    if (target) requestFocus(id, segsSize(target.main));
  };

  if (!layout) return <div style={{ padding: 24 }}>載入字型…</div>;

  const S = doc.settings.layoutScale || 1;
  const mgP = doc.settings.page.margins; // 紙張上的邊界（mm）
  const mg = mgP.map((x) => x / S); // 版面單位的邊界（圖層內使用）
  const { w, h: ph } = layout.page;
  const fs = doc.settings.main.size;
  const gap = GAP_MM;
  const stride = ph + gap;
  const sheetH = layout.pages * stride - gap - 0.4;
  const strideL = stride / S;
  const wL = w / S;
  const sheetHL = sheetH / S;
  const inc = C.findIncomplete(doc);
  // 每一欄依自己的語言選字型（§8.1）
  const cellStyleFor = (col: string) => ({ fontFamily: cellFont(doc, col), fontSize: `${fs}pt`, lineHeight: LINE_HEIGHT }) as const;

  const undoBtn = (redo: boolean) => handlers.onKey(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: redo }), '', 'main', 0, false, false);
  const selBracket = (() => {
    if (sel.length !== 1) return null;
    const it = locate(h.present, sel[0]);
    const x = it?.list[it.index].item;
    return x && x.kind === 'bracket' ? x : null;
  })();
  const orderIdx = new Map(layout.rows.map((r, i) => [r.id, i]));
  const rowById = new Map(rowsInOrder(doc).map((r) => [r.id, r]));
  const splitRows = layout.rows.filter((r) => r.fragments).length;
  const openLongEdit = (rowId: string, col: string, segs: Seg[]) => {
    setLongEdit({ rowId, col });
    requestFocus(rowId, segsSize(segs), col);
  };

  // ───────── 輸出與匯出前檢查（§9.5） ─────────
  const jumpTo = (t: NonNullable<Issue['target']>) => {
    const id = t.rowId ?? (t.bracketId ? firstRowOfBracket(t.bracketId) : null);
    if (t.bracketId) setSel([t.bracketId]);
    else if (t.rowId) setSel([t.rowId]);
    if (id) document.querySelector(`[data-rowid="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const firstRowOfBracket = (bid: string): string | null => {
    const it = locate(hRef.current.present, bid);
    const x = it?.list[it.index].item;
    return x ? firstRow(x).id : null;
  };

  const doOutput = async (kind: 'pdf' | 'print') => {
    if (kind === 'pdf') {
      if (!window.api) return window.print();
      const path = await window.api.exportPdf(doc.settings.page.orientation);
      if (path) setNotice(`已匯出：${path}`);
    } else if (window.api) await window.api.print();
    else window.print();
  };

  /** 按「匯出 PDF」或「列印」：有未完成項目時先顯示清單；點任一項會跳到那個位置。 */
  const startOutput = (kind: 'pdf' | 'print') => {
    const pf = preflight(doc, layout, fontsReady);
    if (!pf.blocking.length && !pf.soft.length) return void doOutput(kind);
    const item = (i: Issue, cls: string, k: string) => (
      <li key={k} className={cls} onClick={() => { setModal(null); if (i.target) jumpTo(i.target); }}>
        {cls === 'block' ? '⛔ ' : '⚠ '}
        {i.text}
      </li>
    );
    setModal({
      title: pf.blocking.length ? '必須先修正才能輸出' : '輸出的內容裡還有沒完成的分析',
      body: (
        <ul className="issues">
          {pf.blocking.map((i, n) => item(i, 'block', `b${n}`))}
          {pf.soft.map((i, n) => item(i, 'soft', `s${n}`))}
        </ul>
      ),
      buttons: pf.blocking.length ? [] : [{ label: '仍要輸出', primary: true, onClick: () => void doOutput(kind) }],
    });
  };
  actions.current.print = () => startOutput('print');
  actions.current.prefs = () => setPrefsDlg(true);
  actions.current.help = () => openHelp();

  /** 「與分析欄交換」：先顯示確認對話框，說明後果與需要檢查的行數（§8.1）。 */
  const askSwap = (colId: string) => {
    const cur = hRef.current.present;
    const plan = C.planSwap(cur, colId);
    setModal({
      title: '交換分析欄與對照欄',
      body: plan.error ? (
        <p className="errs">{plan.error}</p>
      ) : (
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <p>
            <b>分析欄（{langName(plan.mainLang)}）⇄ 對照欄（{langName(plan.colLang)}）</b>
          </p>
          <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
            <li>每一行的文字和欄語言對調；括號、關係標記、縮排、分頁點都不變。</li>
            <li>經節標記只能放在分析欄：每一行的經節標記會依原順序集中到新分析欄文字的行首。</li>
            {plan.midMarkerRows.length > 0 && (
              <li style={{ color: '#b00020' }}>
                <b>{plan.midMarkerRows.length} 行含行中的經節標記</b>：標記移到行首後，那一行的全部新文字都歸給最後一個標記的經節，請交換後檢查。
              </li>
            )}
            {plan.emptyNewMain > 0 && <li>{plan.emptyNewMain} 行的對照欄是空白，交換後新分析欄的那一行是空行。</li>}
            <li>可以用 {k('⌘Z')} 一次回到交換前。</li>
          </ul>
        </div>
      ),
      buttons: plan.error ? [] : [{ label: '交換', primary: true, onClick: () => void run(C.swapMainWithRefColumn(hRef.current.present, colId)) }],
    });
  };

  const applySettings = (next: typeof doc.settings) => void run(C.setSettings(hRef.current.present, next));
  const tweak = (fn: (s: typeof doc.settings) => void) => {
    const next = structuredClone(doc.settings);
    fn(next);
    applySettings(next);
  };

  return (
    <>
      <div className="topbars" ref={(el) => { if (el) document.documentElement.style.setProperty("--topH", `${el.offsetHeight}px`); }}>
      <div className="toolbar">
        <strong>經文結構分析</strong>
        <span style={{ color: '#666' }}>{H.isDirty(h) ? '已編輯' : '已儲存'}</span>
        <button onClick={() => actions.current.open()}>開啟</button>
        <button onClick={() => void save(false)}>存檔</button>
        {(hasNative() || browserApi.supportsInPlaceSave()) && <button onClick={() => void save(true)}>另存新檔</button>}
        {hasNative() && <button onClick={() => setBackupDlg(true)}>開啟備份…</button>}
        {/* 這是「新增」選單：選了就會用範本開一份新文件，取代目前畫面上的文件（有未存的變更會先詢問） */}
        <select value="" title="新增文件" onChange={(e) => (e.target.value === 'bible' ? setBibleDlg(true) : e.target.value && switchSource(e.target.value as 'sample' | 'blank' | 'stress'))}>
          <option value="" disabled>新增…</option>
          <option value="blank">＋ 空白新文件</option>
          <option value="bible">＋ 從聖經帶入經文…（和合本／BSB／SBLGNT）</option>
          {!PUBLIC && <option value="sample">＋ 範例：約翰福音 3:14–21（重做）</option>}
          {!PUBLIC && <option value="stress">＋ 範例：跨頁壓力測試（70 行・三欄）</option>}
        </select>
        <span className="sep" />
        <button onClick={() => undoBtn(false)} disabled={!h.past.length}>復原</button>
        <button onClick={() => undoBtn(true)} disabled={!h.future.length}>重做</button>
        <span className="sep" />
        <button onClick={() => actions.current.create()} title={k("⌘G：選取相鄰的行後，包成括號")}>建立括號</button>
        <button onClick={() => actions.current.dissolve()} title={k("⌘⇧G：先點選括號的垂直線")}>解除括號</button>
        <button onClick={() => actions.current.up()} title={k("⌥↑")}>上移</button>
        <button onClick={() => actions.current.down()} title={k("⌥↓")}>下移</button>
        <button onClick={() => actions.current.into()} title={k("⌘]：併入下方相鄰的括號")}>併入括號</button>
        <button onClick={() => actions.current.out()} title={k("⌘[：移出所在的括號")}>移出括號</button>
        <button onClick={() => actions.current.del()} title="先在左側選取行">刪除行</button>
        <span className="sep" />
        <button onClick={() => setLayoutDlg(true)}>版面設定…</button>
        <button onClick={() => setBibleColDlg(true)} title="把內建的和合本／BSB／SBLGNT 依經節放進對照欄">加入經文對照…</button>
        <button onClick={() => setRelDlg(true)}>關係表…</button>
        <button onClick={() => setPrefsDlg(true)} title={k("⌘,")}>偏好設定…</button>
        <button onClick={() => tweak((x) => (x.page.orientation = landscape ? 'portrait' : 'landscape'))} title="切換頁面方向">{landscape ? '橫向' : '直向'}</button>
        <label>
          檢視縮放{' '}
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            {[...new Set([0.5, 0.75, 1, 1.25, 1.5, zoom])].sort((a, b) => a - b).map((z) => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}
          </select>
        </label>
        <span className="spacer" />
        {layout.warnings.tooTall.length > 0 && <span className="warn">有 {layout.warnings.tooTall.length} 個整節對照區塊超高，無法輸出</span>}
        <button onClick={() => openHelp()} title={k("⌘/")}>說明</button>
        <button onClick={() => setShowLog((v) => !v)}>{showLog ? '隱藏' : '顯示'}偵錯面板</button>
        <button onClick={() => startOutput('print')} title={k("⌘P")}>列印</button>
        <button onClick={() => startOutput('pdf')}>匯出 PDF</button>
      </div>

      <div className="toolbar sub" onMouseDown={(e) => { if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault(); }}>
        <span>文字</span>
        <button onClick={() => doMark('b')} title={k("⌘B")} style={{ fontWeight: 700 }}>B</button>
        <button onClick={() => doMark('i')} title={k("⌘I")} style={{ fontStyle: 'italic' }}>I</button>
        <button onClick={() => doMark('u')} title={k("⌘U")} style={{ textDecoration: 'underline' }}>U</button>
        <button onClick={() => doMark('sup')} title="上標">x²</button>
        <span className="swatches" title="螢光底色">
          螢光
          {['#fff59d', '#c8e6c9', '#f8bbd0', '#bbdefb'].map((c) => <button key={c} className="sw" style={{ background: c }} onClick={() => doMark({ hl: c })} />)}
        </span>
        <span className="swatches" title="文字顏色">
          顏色
          {['#c62828', '#1565c0', '#2e7d32', '#6a1b9a'].map((c) => <button key={c} className="sw" style={{ background: c }} onClick={() => doMark({ color: c })} />)}
        </span>
        <button onClick={() => doMark('clear')}>清除標記</button>
        <span className="sep" />
        <button onClick={markAsVerse} title="先選取一個數字">標為經節</button>
        <span className="sep" />
        <label>標題 <input defaultValue={h.present.meta.title} key={`t${h.present.meta.title}`} style={{ width: 200 }}
          onBlur={(e) => e.target.value !== h.present.meta.title && run(C.setMeta(hRef.current.present, { title: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} /></label>
        <label>起始章 <input defaultValue={h.present.meta.startChapter} key={`c${h.present.meta.startChapter}`} style={{ width: 44 }}
          onBlur={(e) => Number(e.target.value) !== h.present.meta.startChapter && run(C.setMeta(hRef.current.present, { startChapter: Number(e.target.value) }))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} /></label>
      </div>

      {!hasNative() && webNote && (
        <div className="webnote screen-only">
          <span>
            <b>網頁版</b>：你的文件只存在這台電腦，<b>不會上傳</b>到任何伺服器。{browserApi.supportsInPlaceSave() ? '「存檔」會直接存回你選的 .verse 檔案。' : '「存檔」會下載一個 .verse 檔案（這個瀏覽器不能直接存回檔案，建議用 Chrome 或 Edge）。'}
            「匯出 PDF」會開啟瀏覽器的列印視窗：目的地選「另存為 PDF」，邊界選「無」，縮放 100%。
          </span>
          <button onClick={() => openHelp('web')}>詳細說明</button>
          <button onClick={() => { localStorage.setItem('webNoteDismissed', '1'); setWebNote(false); }}>知道了</button>
        </div>
      )}
      {layout.warnings.narrow && (
        <div className="narrow screen-only">
          <b>版面過窄</b>：分析欄扣掉最深的縮排後少於 40mm。不會自動縮小，請選一個：
          {!landscape && <button onClick={() => tweak((x) => (x.page.orientation = 'landscape'))}>改成橫向</button>}
          <button onClick={() => tweak((x) => (x.layoutScale = Math.max(0.5, Math.round((x.layoutScale - 0.1) * 100) / 100)))}>版面縮放 −10%</button>
          <button onClick={() => tweak((x) => (x.main.size = Math.max(6, x.main.size - 1)))}>字級 −1pt</button>
          <button onClick={() => tweak((x) => (x.indentStep = Math.max(1, Math.round((x.indentStep - 1) * 10) / 10)))}>每階縮排 −1mm</button>
          {doc.settings.refColumns.filter((c) => c.visible).map((c) => (
            <button key={c.id} onClick={() => tweak((x) => (x.refColumns.find((y) => y.id === c.id)!.visible = false))}>關閉對照欄（{c.lang}）</button>
          ))}
        </div>
      )}
      </div>

      <div className="desk" style={{ zoom, paddingRight: selBracket ? 316 : 16 }}>
        <div className="sheet" onMouseDown={clickSheet} style={{ width: `${w}mm`, height: `${sheetH}mm` }}>
          {Array.from({ length: layout.pages }, (_, p) => (
            <div key={p} className="page" style={{ top: `${p * stride}mm`, width: `${w}mm`, height: `${ph}mm` }} />
          ))}
          <div className="layer" style={{ width: `${wL}mm`, height: `${sheetHL}mm`, transform: `scale(${S})` }}>
          <div className="title" style={{ left: `${mg[3]}mm`, top: `${mg[0] + 4 / S}mm`, fontFamily: fontStack(doc) }}>{doc.meta.title}</div>
          <svg className="tree" width={`${wL}mm`} height={`${sheetHL}mm`} viewBox={`0 0 ${wL} ${sheetHL}`}>
            {Array.from({ length: layout.pages }, (_, p) => (
              <g key={p} transform={`translate(${mg[3]} ${p * strideL + mg[0]})`}>
                <g stroke="#000" strokeWidth={0.18} strokeLinecap="square">
                  {layout.lines.filter((l) => l.page === p).map((l, i) => (
                    <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.bracketId && sel.includes(l.bracketId) ? '#0a64ff' : undefined} strokeWidth={l.bracketId && sel.includes(l.bracketId) ? 0.45 : undefined} />
                  ))}
                </g>
                {/* 點垂直線選取括號（透明的粗線只是方便點擊） */}
                {layout.lines.filter((l) => l.page === p && l.vertical).map((l, i) => (
                  <line key={`hit${i}`} className="hit screen-only" x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="transparent" strokeWidth={2.4}
                    data-bracket={l.bracketId}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const id = l.bracketId!;
                      // ⌘＋點括號的線：加選／取消加選（可以和行、其他括號一起選，用來把括號包進更大的括號）
                      if (e.metaKey || e.ctrlKey) return setSel((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
                      setSel([id]);
                      dragStart.current = { ids: [id], x: e.clientX, y: e.clientY, active: false };
                    }} />
                ))}
                {layout.labels.filter((l) => l.page === p).map((l, i) => (
                  <g key={i} className={l.pending ? 'screen-only' : undefined}>
                    {l.pending && <rect x={l.x - 0.3} y={l.y} width={l.w + 0.6} height={l.h} fill="#ffe66d" />}
                    <text x={l.x} y={l.y + l.h * 0.82} fontSize={LABEL_PT * 0.3528} fontWeight={l.main ? 700 : 400} fontFamily={fontStack(doc)}>{l.text}</text>
                    {l.custom && <circle className="screen-only" cx={l.x + l.w + 0.3} cy={l.y + 0.4} r={0.35} fill="#06c" />}
                  </g>
                ))}
                {layout.flags.filter((f) => f.page === p).map((f, i) => (
                  <text key={i} className="screen-only" x={f.x} y={f.y} fontSize={3.2} fill={f.kind === 'missingMain' ? '#d00' : '#e6a700'} fontWeight={700}>{f.kind === 'missingMain' ? '!' : '?'}</text>
                ))}
              </g>
            ))}
          </svg>
          {/* 所有列放在同一個連續圖層；換頁只改位置，不重建編輯器（§3.4） */}
          {layout.rows.map((r) => {
            const row = rowById.get(r.id)!;
            const mainW = layout.analysisW - (r.textX - layout.treeW) - (layout.refCols.length ? GUTTER : 0);
            const cells = [
              { col: 'main', x: r.textX, w: mainW, segs: row.main, color: undefined as string | undefined },
              ...layout.refCols
                .filter((c) => doc.settings.refColumns.find((x) => x.id === c.id)?.mode !== 'verse')
                .map((c) => ({ col: c.id, x: c.x, w: c.w - GUTTER, segs: row.refs[c.id] ?? [], color: '#333' as string | undefined })),
            ];
            // 一列比一頁還高時跨頁（§9.2）：每一段各畫在自己那一頁，只顯示這一段的內容（唯讀）；
            // 點一下展開編輯視窗，編輯整格。
            const frags = r.fragments ?? [{ page: r.page, y: r.y, h: r.h, offset: 0 }];
            const split = !!r.fragments;
            return frags.map((f, fi) => (
              <div key={`${r.id}-${fi}`} data-rowid={fi === 0 ? r.id : undefined} className={`row${r.tooTall ? ' tall' : ''}${split ? ' split' : ''}`}
                style={{ top: `${f.page * strideL + mg[0] + f.y}mm`, left: `${mg[3]}mm`, width: `${layout.page.contentW}mm`, height: `${f.h}mm` }}>
                {sel.includes(r.id) && <div className="rowsel screen-only" />}
                {fi === 0 && (
                  <div className={`gutter screen-only${sel.includes(r.id) ? ' on' : ''}`} onMouseDown={(e) => selectRow(r.id, e)} title={k("點選整行（⇧連選、⌘加選）")}>
                    {(orderIdx.get(r.id) ?? 0) + 1}
                  </div>
                )}
                {cells.map((c) => {
                  const isLong = longEdit?.rowId === r.id && longEdit.col === c.col;
                  if (split || isLong)
                    return (
                      <div key={c.col} className="fragcell" style={{ left: `${c.x}mm`, width: `${c.w}mm`, height: `${f.h}mm` }}
                        title="這一列跨頁；點一下展開編輯" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); openLongEdit(r.id, c.col, c.segs); }}>
                        <div className="cell" style={{ ...cellStyleFor(c.col), position: 'absolute', left: 0, top: `${-f.offset}mm`, width: '100%', color: c.color }}>
                          <Segs segs={c.segs} />
                        </div>
                      </div>
                    );
                  return c.col === 'main' ? (
                    <CellEditor key={c.col} rowId={r.id} segs={c.segs} focus={focus} handlers={handlers} style={{ ...cellStyleFor('main'), left: `${c.x}mm`, width: `${c.w}mm` }} />
                  ) : (
                    <CellEditor key={c.col} rowId={r.id} col={c.col} segs={c.segs} focus={focus} handlers={handlers}
                      style={{ ...cellStyleFor(c.col), left: `${c.x}mm`, width: `${c.w}mm`, minHeight: `${r.h}mm`, color: '#333' }} />
                  );
                })}
              </div>
            ));
          })}
          {/* 經文來源與授權（CC BY 要求標示來源）：印在最後一頁的下邊界裡 */}
          {doc.meta.credits && (
            <div className="credits" style={{ left: `${mg[3]}mm`, width: `${layout.page.contentW}mm`, top: `${((layout.pages - 1) * stride + ph - mgP[2] * 0.7) / S}mm` }}>{doc.meta.credits}</div>
          )}
          {/* 整節對照：每一節的譯文放在涵蓋它的行的第一行位置，往下跨越這些行（§8） */}
          {layout.verseBlocks.map((b) => {
            const col = doc.settings.refColumns.find((x) => x.id === b.colId)!;
            return (
              <div key={`${b.colId}-${b.keys[0]}`} className="vblock" style={{ top: `${b.page * strideL + mg[0] + b.y}mm`, left: `${mg[3] + b.x}mm`, width: `${b.w}mm` }}>
                {b.keys.map((k) => (
                  <CellEditor key={k} rowId={`v:${k}`} col={b.colId} segs={col.verses?.[k] ?? []} focus={focus} handlers={handlers} vtag={k.split(':')[1]}
                    style={{ ...cellStyleFor(b.colId), width: `${b.w}mm`, color: '#333' }} />
                ))}
              </div>
            );
          })}
          </div>
        </div>
      </div>

      {selBracket && <RelationPanel doc={h.present} bracket={selBracket} run={(r) => void run(r)} onClose={() => setSel([])} />}
      {modal && <Modal spec={modal} onClose={() => setModal(null)} />}
      {refPaste && (
        <RefPastePreview
          doc={h.present}
          colId={refPaste.col}
          startRowId={refPaste.rowId}
          text={refPaste.text}
          onClose={() => setRefPaste(null)}
          onApply={(cells, summary) => {
            const isVerse = hRef.current.present.settings.refColumns.find((c) => c.id === refPaste.col)?.mode === 'verse';
            if (run(isVerse ? C.setVerseCells(hRef.current.present, refPaste.col, cells) : C.setRefCells(hRef.current.present, refPaste.col, cells.map((c) => ({ rowId: c.key, segs: c.segs }))))) setNotice(summary);
            setRefPaste(null);
          }}
        />
      )}
      {longEdit && rowById.has(longEdit.rowId) && (
        <div className="longedit screen-only" onKeyDown={(e) => e.key === 'Escape' && setLongEdit(null)}>
          <div className="longedit-head">
            <b>編輯第 {(orderIdx.get(longEdit.rowId) ?? 0) + 1} 行{longEdit.col === 'main' ? '' : `（對照欄 ${doc.settings.refColumns.find((c) => c.id === longEdit.col)?.lang ?? ''}）`}</b>
            <span className="hint">這一列比一頁還高，輸出時會自動跨頁切開；這裡編輯整格內容</span>
            <button onClick={() => setLongEdit(null)}>完成（Esc）</button>
          </div>
          <CellEditor rowId={longEdit.rowId} col={longEdit.col} focus={focus} handlers={handlers}
            segs={longEdit.col === 'main' ? rowById.get(longEdit.rowId)!.main : rowById.get(longEdit.rowId)!.refs[longEdit.col] ?? []}
            style={{ ...cellStyleFor(longEdit.col), position: 'static', width: '100%', minHeight: '28vh', border: '1px solid #ccd', borderRadius: 4, padding: '6px 8px', background: '#fff' }} />
        </div>
      )}
      {bibleColDlg && <BibleToColumn doc={h.present} onClose={() => setBibleColDlg(false)} onApply={(spec) => void run(C.addBibleColumn(hRef.current.present, spec))} />}
      {bibleDlg && (
        <BibleImport
          onClose={() => setBibleDlg(false)}
          onCreate={(d, notes) => {
            confirmDiscard(() => {
              loadDoc(d, null);
              const where = `分析欄：${langName(d.settings.main.lang)}${d.settings.refColumns.length ? `；對照欄：${d.settings.refColumns.map((c) => langName(c.lang)).join('、')}` : ''}`;
              setNotice(notes.length ? `已帶入經文（${where}）。注意：${notes.slice(0, 2).join('；')}${notes.length > 2 ? `…（共 ${notes.length} 項）` : ''}` : `已帶入經文（${where}）`);
            });
          }}
        />
      )}
      {backupDlg && (
        <BackupBrowser
          currentPath={filePath}
          onClose={() => setBackupDlg(false)}
          onOpenCopy={(d) => confirmDiscard(() => loadDoc(d, null))}
          onReplace={(d) => {
            // 取代目前文件內容：一個復原步驟，⌘Z 可以回到取代前
            setH(H.push(hRef.current, d, curSel.current));
            setSel([]);
            setNotice(k('已用備份版本取代目前文件的內容，可以按 ⌘Z 復原'));
          }}
        />
      )}
      {prefsDlg && (
        <PrefsDialog
          init={getPrefs()}
          onClose={() => setPrefsDlg(false)}
          onApply={(p) => void savePrefs(p).then(() => setNotice('偏好設定已儲存'))}
          onReset={() => void resetPrefs().then(() => setNotice('偏好設定已還原成預設'))}
          onEditDefaults={() => { setPrefsDlg(false); setDefaultsDlg(true); }}
          onEditRelations={() => { setPrefsDlg(false); setRelDlg(true); }}
        />
      )}
      {defaultsDlg && (
        <LayoutSettings
          title="新文件的預設版面"
          hideRefColumns
          init={getPrefs().newDoc}
          onClose={() => setDefaultsDlg(false)}
          onApply={(st) => void savePrefs({ newDoc: st }).then(() => setNotice('新文件的預設版面已儲存（已經存在的文件不受影響）'))}
        />
      )}
      {relDlg && (
        <RelationTableEditor
          init={getRelationTypes()}
          docMissing={(types) => types.filter((t) => !doc.relationTypes.some((x) => x.id === t.id || x.name === t.name)).length}
          onMergeToDoc={(types) => void run(C.mergeRelationTypes(hRef.current.present, types))}
          onClose={() => setRelDlg(false)}
        />
      )}
      {layoutDlg && <LayoutSettings init={doc.settings} onApply={applySettings} onSwap={askSwap} onClose={() => setLayoutDlg(false)} />}
      {verseEdit && (
        <VerseEditor
          init={verseEdit}
          onClose={() => setVerseEdit(null)}
          onApply={(c, v, shown) => viaView((view) => view.dispatch(view.state.tr.setNodeMarkup(verseEdit.pos, undefined, { c, v, shown })), verseEdit.rowId)}
          onToText={() => viaView((view) => view.dispatch(view.state.tr.replaceWith(verseEdit.pos, verseEdit.pos + 1, schema.text(String(verseEdit.v)))), verseEdit.rowId)}
          onDelete={() => viaView((view) => view.dispatch(view.state.tr.delete(verseEdit.pos, verseEdit.pos + 1)), verseEdit.rowId)}
        />
      )}
      {showLog && (
        <div className="debug screen-only">
          <b>偵錯面板</b>　復原步驟 {h.past.length}・重做 {h.future.length}・打字群組 {h.group ? `開（${h.group.rowId}）` : '關'}
          <ol>{log.map((l, i) => <li key={i}>{l}</li>)}</ol>
        </div>
      )}
      {drag && (
        <>
          {drag.target && (
            <div className="dropline screen-only" style={{ left: drag.target.lineX, top: drag.target.lineY - 1.5, width: Math.max(8, drag.target.right - drag.target.lineX) }}>
              <i />
            </div>
          )}
          <div className={`dragghost screen-only${drag.target ? '' : ' no'}`} style={{ left: drag.x + 14, top: drag.y + 14 }}>
            {drag.target ? `移動 ${drag.n} 項` : '這裡不能放'}
          </div>
        </>
      )}
      <div className="statusbar">
        <span>{layout.pages} 頁・{layout.rows.length} 行{splitRows ? `・${splitRows} 列跨頁` : ''}</span>
        <span>未指定關係 {inc.unassignedBrackets.length}・待判定 {inc.pendingLabels.length}・缺主句 {inc.missingMain.length}</span>
        <span>{k(notice)}</span>
        {pasteInfo && h.present === pasteInfo.doc && <button onClick={cancelDetect}>取消經節辨識</button>}
      </div>
    </>
  );
}
