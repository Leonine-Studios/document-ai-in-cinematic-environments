import { editorReducer, initialEditorState, type EditorAction, type EditorState } from "./editorState";

export interface HistoryState {
  past: EditorState[];
  present: EditorState;
  future: EditorState[];
}

export const initialHistoryState: HistoryState = { past: [], present: initialEditorState, future: [] };

export type HistoryAction = EditorAction | { type: "UNDO" } | { type: "REDO" };

const HISTORY_LIMIT = 100;

/**
 * Transient UI state, not document edits — undoing them would surprise the
 * user (Ctrl+Z clearing a selection or dismissing a banner instead of
 * reverting their last real edit). See docs/planning/04-editor.md Part J.
 */
const NOT_UNDOABLE = new Set<EditorAction["type"]>(["SET_SELECTION", "IMPORT_FAILED", "DISMISS_IMPORT_ERRORS"]);

/** Opening/closing a package starts a fresh undo history — undoing across a package boundary would resurrect a different document's data. */
const RESETS_HISTORY = new Set<EditorAction["type"]>(["NEW_PACKAGE", "LOAD_PACKAGE", "CLOSE_PACKAGE"]);

/**
 * Wraps `editorReducer` with a simple linear undo/redo history (Ctrl+Z /
 * Ctrl+Shift+Z), so the whole working document — package fields, assets,
 * references, selection-independent — can be stepped back and forward. See
 * docs/planning/04-editor.md Part J ("Editor v3").
 */
export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === "UNDO") {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
    };
  }

  if (action.type === "REDO") {
    if (state.future.length === 0) return state;
    const [next, ...rest] = state.future;
    return {
      past: [...state.past, state.present].slice(-HISTORY_LIMIT),
      present: next,
      future: rest,
    };
  }

  const nextPresent = editorReducer(state.present, action);

  if (RESETS_HISTORY.has(action.type)) {
    return { past: [], present: nextPresent, future: [] };
  }
  if (nextPresent === state.present || NOT_UNDOABLE.has(action.type)) {
    return { ...state, present: nextPresent };
  }
  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: nextPresent,
    future: [],
  };
}
