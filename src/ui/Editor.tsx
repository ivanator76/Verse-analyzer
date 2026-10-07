import { useEffect, useRef } from 'react';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Seg } from '../core/types';
import { pmToSegs, schema, segsToPm, segsSize } from './pm';

export interface FocusReq {
  rowId: string;
  /** 'main'＝分析欄；其他是對照欄 id */
  col: string;
  offset: number;
  nonce: number;
}

export interface EditorHandlers {
  /** 文字改變（一次交易）。composing＝輸入法組字中。 */
  onText(rowId: string, col: string, segs: Seg[], composing: boolean): void;
  onSelection(rowId: string, col: string, offset: number, docChanged: boolean): void;
  onCompositionEnd(): void;
  /** 回傳 true 表示已處理 */
  onKey(e: KeyboardEvent, rowId: string, col: string, offset: number, atStart: boolean, atEnd: boolean): boolean;
  onPaste(rowId: string, col: string, offset: number, text: string): void;
  /** 點到經節標記（nodePos：標記在編輯器內的位置） */
  onVerseClick(rowId: string, nodePos: number): void;
}

/** 所有編輯器，供工具列（文字標記、標為經節）與經節標記對話框使用。 */
const views = new Map<string, EditorView>();
const keyOf = (rowId: string, col: string) => `${rowId}|${col}`;
let active: { rowId: string; col: string } | null = null;
export const getView = (rowId: string, col = 'main') => views.get(keyOf(rowId, col)) ?? null;
export const getActiveView = () => (active ? getView(active.rowId, active.col) : null);
export const getActiveRowId = () => active?.rowId ?? null;
export const getActiveCol = () => active?.col ?? null;

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 單一格子的文字編輯器。模型是唯一資料來源（§3.1、§3.3）。 */
export function CellEditor({
  rowId,
  col = 'main',
  segs,
  focus,
  handlers,
  style,
  vtag,
}: {
  rowId: string;
  col?: string;
  segs: Seg[];
  focus: FocusReq | null;
  handlers: EditorHandlers;
  style: React.CSSProperties;
  /** 整節對照的節號（畫在段落前面） */
  vtag?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef({ segs, handlers, rowId, col });
  latest.current = { segs, handlers, rowId, col };
  const pendingSync = useRef(false);
  const lastFocus = useRef(0);

  useEffect(() => {
    const v = new EditorView(host.current!, {
      state: EditorState.create({ schema, doc: segsToPm(latest.current.segs) }),
      dispatchTransaction(tr) {
        const prev = v.state;
        v.updateState(prev.apply(tr));
        const { handlers: h, rowId: id, col: c } = latest.current;
        if (tr.docChanged && !tr.getMeta('external')) h.onText(id, c, pmToSegs(v.state.doc), !!v.composing);
        if (v.hasFocus()) active = { rowId: id, col: c };
        if (tr.docChanged || tr.selectionSet) h.onSelection(id, c, v.state.selection.head - 1, tr.docChanged);
      },
      handleKeyDown(view, e) {
        // 組字中的按鍵一律交給輸入法（§3.2）
        if (view.composing || e.isComposing || e.keyCode === 229) return false;
        const sel = view.state.selection;
        const size = view.state.doc.content.size - 2;
        const off = sel.head - 1;
        const empty = sel.empty;
        const handled = latest.current.handlers.onKey(e, latest.current.rowId, latest.current.col, off, empty && off === 0, empty && off === size);
        if (handled) e.preventDefault();
        return handled;
      },
      handlePaste(view, event) {
        const text = event.clipboardData?.getData('text/plain') ?? '';
        if (view.composing) return false;
        event.preventDefault();
        latest.current.handlers.onPaste(latest.current.rowId, latest.current.col, view.state.selection.head - 1, text);
        return true;
      },
      handleClickOn(_view, _pos, node, nodePos) {
        if (node.type.name !== 'verse') return false;
        latest.current.handlers.onVerseClick(latest.current.rowId, nodePos);
        return true;
      },
      handleDOMEvents: {
        focus: () => {
          active = { rowId: latest.current.rowId, col: latest.current.col };
          return false;
        },
      },
      handleDrop: () => true,
    });
    view.current = v;
    views.set(keyOf(latest.current.rowId, latest.current.col), v);
    const onEnd = () => {
      latest.current.handlers.onCompositionEnd();
      setTimeout(() => {
        if (pendingSync.current) sync();
      }, 0);
    };
    v.dom.addEventListener('compositionend', onEnd);
    return () => {
      v.dom.removeEventListener('compositionend', onEnd);
      if (views.get(keyOf(latest.current.rowId, latest.current.col)) === v) views.delete(keyOf(latest.current.rowId, latest.current.col));
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 模型 → 編輯器。有特別標記，不會被當成新的操作（§3.3）。組字中延後。 */
  function sync() {
    const v = view.current;
    if (!v) return;
    if (v.composing) {
      pendingSync.current = true;
      return;
    }
    pendingSync.current = false;
    if (sameJson(pmToSegs(v.state.doc), latest.current.segs)) return;
    const next = segsToPm(latest.current.segs);
    const tr = v.state.tr.replaceWith(0, v.state.doc.content.size, next.content).setMeta('external', true);
    v.dispatch(tr);
  }

  useEffect(() => {
    sync();
    const v = view.current;
    if (v && focus && focus.rowId === rowId && focus.col === col && focus.nonce !== lastFocus.current) {
      lastFocus.current = focus.nonce;
      const max = v.state.doc.content.size - 1;
      const pos = Math.max(1, Math.min(max, 1 + focus.offset));
      v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, pos)).setMeta('external', true));
      active = { rowId, col };
      v.focus();
    }
  });

  return <div ref={host} className={`cell rowtext editor${col !== 'main' ? ' refcell' : ''}${vtag ? ' vcell' : ''}`} style={vtag ? ({ ...style, '--vtag': `"${vtag}"` } as React.CSSProperties) : style} data-row={rowId} data-col={col} data-size={segsSize(segs)} />;
}
