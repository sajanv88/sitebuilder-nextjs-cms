// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { useCallback, useMemo, useReducer } from "react";

// Undo and redo for the editor's blocks. Each change is a step, except that changes with the
// same `merge` key less than MERGE_MS apart are one: typing a headline is one step, not one
// per letter. Only the newest LIMIT steps are kept.

export const LIMIT = 100;
export const MERGE_MS = 1500;

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  // The last change's merge key and when it was made, for joining the next one to it.
  merge: { key: string; at: number } | null;
}

export type HistoryAction<T> =
  | { type: "set"; next: T | ((now: T) => T); merge?: string | undefined; at: number }
  // Takes up a value without a step, such as the cleaned copy a save hands back.
  | { type: "replace"; value: T }
  // A new starting point with no history, such as a restored revision.
  | { type: "reset"; value: T }
  | { type: "undo" }
  | { type: "redo" };

export function historyReducer<T>(
  state: HistoryState<T>,
  action: HistoryAction<T>,
): HistoryState<T> {
  switch (action.type) {
    case "set": {
      const next =
        typeof action.next === "function"
          ? (action.next as (now: T) => T)(state.present)
          : action.next;
      if (Object.is(next, state.present)) return state;
      const joins =
        action.merge !== undefined &&
        state.merge?.key === action.merge &&
        action.at - state.merge.at < MERGE_MS;
      const merge = action.merge === undefined ? null : { key: action.merge, at: action.at };
      if (joins) return { ...state, present: next, future: [], merge };
      return {
        past: [...state.past, state.present].slice(-LIMIT),
        present: next,
        future: [],
        merge,
      };
    }
    case "replace":
      return { ...state, present: action.value, merge: null };
    case "reset":
      return { past: [], present: action.value, future: [], merge: null };
    case "undo": {
      const previous = state.past.at(-1);
      if (previous === undefined) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        merge: null,
      };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (next === undefined) return state;
      return { past: [...state.past, state.present], present: next, future: rest, merge: null };
    }
  }
}

export interface History<T> {
  value: T;
  set: (next: T | ((now: T) => T), options?: { merge?: string }) => void;
  replace: (value: T) => void;
  reset: (value: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory<T>(initial: T): History<T> {
  const [state, dispatch] = useReducer(historyReducer<T>, {
    past: [],
    present: initial,
    future: [],
    merge: null,
  });
  const set = useCallback(
    (next: T | ((now: T) => T), options?: { merge?: string }) =>
      dispatch({ type: "set", next, merge: options?.merge, at: Date.now() }),
    [],
  );
  const replace = useCallback((value: T) => dispatch({ type: "replace", value }), []);
  const reset = useCallback((value: T) => dispatch({ type: "reset", value }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  return useMemo(
    () => ({
      value: state.present,
      set,
      replace,
      reset,
      undo,
      redo,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    }),
    [state, set, replace, reset, undo, redo],
  );
}
