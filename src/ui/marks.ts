import { toggleMark } from 'prosemirror-commands';
import type { EditorView } from 'prosemirror-view';
import { schema } from './pm';

export type MarkAction = 'b' | 'i' | 'u' | 'sup' | { hl: string } | { color: string } | 'clear';

/** 對目前選取的文字套用／取消文字標記（§1：粗體、斜體、底線、上標、螢光底色、文字顏色）。 */
export function applyMark(view: EditorView, a: MarkAction): boolean {
  const { state, dispatch } = view;
  if (a === 'clear') {
    const { from, to, empty } = state.selection;
    if (empty) return dispatch(state.tr.setStoredMarks([])), true;
    dispatch(state.tr.removeMark(from, to));
    return true;
  }
  if (typeof a === 'string') return toggleMark(schema.marks[a])(state, dispatch);
  if ('hl' in a) return toggleMark(schema.marks.hl, { color: a.hl })(state, dispatch);
  return toggleMark(schema.marks.color, { color: a.color })(state, dispatch);
}
