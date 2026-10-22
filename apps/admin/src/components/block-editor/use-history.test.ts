// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { describe, expect, test } from "vitest";
import {
  type HistoryAction,
  type HistoryState,
  historyReducer,
  LIMIT,
  MERGE_MS,
} from "./use-history";

const start = (present: string): HistoryState<string> => ({
  past: [],
  present,
  future: [],
  merge: null,
});
const run = (state: HistoryState<string>, ...actions: HistoryAction<string>[]) =>
  actions.reduce(historyReducer<string>, state);

describe("historyReducer", () => {
  test("undo and redo walk the steps, and a new change drops what was undone", () => {
    let state = run(
      start("a"),
      { type: "set", next: "b", at: 0 },
      { type: "set", next: (now) => `${now}c`, at: 10_000 },
    );
    expect(state.present).toBe("bc");
    state = run(state, { type: "undo" }, { type: "undo" });
    expect(state.present).toBe("a");
    expect(run(state, { type: "undo" })).toBe(state);
    state = run(state, { type: "redo" });
    expect(state.present).toBe("b");
    state = run(state, { type: "set", next: "x", at: 20_000 });
    expect(state.future).toEqual([]);
    expect(state.past).toEqual(["a", "b"]);
  });

  test("typing in one field is one step; a pause or another field starts a new one", () => {
    const state = run(
      start(""),
      { type: "set", next: "H", merge: "props:1", at: 0 },
      { type: "set", next: "He", merge: "props:1", at: 200 },
      { type: "set", next: "Hey", merge: "props:1", at: 400 },
      { type: "set", next: "Hey!", merge: "props:1", at: 400 + MERGE_MS },
      { type: "set", next: "Hey!?", merge: "props:2", at: 400 + MERGE_MS + 1 },
    );
    expect(state.past).toEqual(["", "Hey", "Hey!"]);
    // Undo ends a run of typing: the next letter is a step of its own.
    const after = run(
      state,
      { type: "undo" },
      { type: "set", next: "Hey!.", merge: "props:1", at: 500 + MERGE_MS },
    );
    expect(after.past).toEqual(["", "Hey", "Hey!"]);
  });

  test("an unchanged value adds nothing; replace and reset add no step", () => {
    const state = run(start("a"), { type: "set", next: "a", at: 0 });
    expect(state.past).toEqual([]);
    const replaced = run(state, { type: "set", next: "b", at: 0 }, { type: "replace", value: "B" });
    expect(replaced).toMatchObject({ past: ["a"], present: "B" });
    expect(run(replaced, { type: "reset", value: "z" })).toEqual(start("z"));
  });

  test(`keeps the newest ${LIMIT} steps`, () => {
    let state = start("0");
    for (let i = 1; i <= LIMIT + 20; i++) {
      state = run(state, { type: "set", next: String(i), at: i * 10_000 });
    }
    expect(state.past).toHaveLength(LIMIT);
    expect(state.past[0]).toBe("20");
  });
});
