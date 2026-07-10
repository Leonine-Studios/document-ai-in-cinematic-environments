import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import type { EditorAction, EditorState } from "./editorState";
import { historyReducer, initialHistoryState } from "./historyReducer";

interface EditorHistoryApi {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const EditorStateContext = createContext<EditorState | null>(null);
const EditorDispatchContext = createContext<Dispatch<EditorAction> | null>(null);
const EditorHistoryContext = createContext<EditorHistoryApi | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [history, dispatch] = useReducer(historyReducer, initialHistoryState);

  const historyApi = useMemo<EditorHistoryApi>(
    () => ({
      undo: () => dispatch({ type: "UNDO" }),
      redo: () => dispatch({ type: "REDO" }),
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
    }),
    [history.past.length, history.future.length],
  );

  return (
    <EditorStateContext.Provider value={history.present}>
      <EditorDispatchContext.Provider value={dispatch}>
        <EditorHistoryContext.Provider value={historyApi}>{children}</EditorHistoryContext.Provider>
      </EditorDispatchContext.Provider>
    </EditorStateContext.Provider>
  );
}

export function useEditorState(): EditorState {
  const state = useContext(EditorStateContext);
  if (!state) throw new Error("useEditorState must be used within an EditorProvider");
  return state;
}

export function useEditorDispatch(): Dispatch<EditorAction> {
  const dispatch = useContext(EditorDispatchContext);
  if (!dispatch) throw new Error("useEditorDispatch must be used within an EditorProvider");
  return dispatch;
}

/** Ctrl+Z / Ctrl+Shift+Z undo-redo, spanning the whole working document. See historyReducer.ts. */
export function useEditorHistory(): EditorHistoryApi {
  const ctx = useContext(EditorHistoryContext);
  if (!ctx) throw new Error("useEditorHistory must be used within an EditorProvider");
  return ctx;
}
