// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { KeyboardIcon } from "@nuvui/icons";
import { Button, Kbd, Popover, PopoverContent, PopoverTrigger } from "@nuvui/react";
import { Fragment } from "react";
import "./editor-shortcuts.scss";

// The editor's keyboard shortcuts, listed where people can find them (nuvui's Command page: a
// shortcut nobody has been told about isn't found). Ctrl is Command on a Mac.

export const SHORTCUTS: { keys: string[]; does: string }[] = [
  { keys: ["Ctrl", "Z"], does: "Undo" },
  { keys: ["Ctrl", "Shift", "Z"], does: "Redo (or Ctrl + Y)" },
  { keys: ["Ctrl", "S"], does: "Save" },
  { keys: ["Ctrl", "K"], does: "Quick add: a block, or an action on the selected one" },
  { keys: ["Alt", "↑"], does: "Move the selected block up" },
  { keys: ["Alt", "↓"], does: "Move the selected block down" },
  { keys: ["Delete"], does: "Remove the selected block" },
];

export function EditorShortcuts() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button intent="ghost" aria-label="Keyboard shortcuts">
          <KeyboardIcon aria-hidden="true" size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="editor-shortcuts" aria-labelledby="editor-shortcuts-title">
        <h2 id="editor-shortcuts-title" className="editor-shortcuts__title">
          Keyboard shortcuts
        </h2>
        <p className="editor-shortcuts__note">
          Ctrl is Command on a Mac. Undo, Delete and the arrows work outside text fields, which keep
          their own.
        </p>
        <dl className="editor-shortcuts__list">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.does} className="editor-shortcuts__row">
              <dt className="editor-shortcuts__keys">
                {shortcut.keys.map((key, index) => (
                  <Fragment key={key}>
                    {index > 0 ? " + " : null}
                    <Kbd>{key}</Kbd>
                  </Fragment>
                ))}
              </dt>
              <dd className="editor-shortcuts__does">{shortcut.does}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
