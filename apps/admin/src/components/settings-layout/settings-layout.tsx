// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nuvui/react";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import "./settings-layout.scss";

// A page of settings sections as nuvui's tabs: a column of them beside the open section on a
// wide screen, a row above it on a narrow one (a column there leaves the forms too little room).
// The open one is in the address (?section=), so the sidebar's links and a reload land on it.
// Every section's form stays mounted while hidden, so switching never loses what's typed.
// Each section is a SettingsSection.

export interface SettingsSectionLink {
  id: string;
  title: string;
}

// nuvui's lg breakpoint, 64rem, from which the tabs stand in a column.
const WIDE = "(min-width: 64rem)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// The server draws the column: the admin is mostly used on a wide screen.
function useWide(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

export function SettingsLayout({
  sections,
  section,
  children,
}: {
  sections: readonly SettingsSectionLink[];
  // The one the address names.
  section: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(section);
  // A link to another section (the sidebar's) while this page is open.
  useEffect(() => setOpen(section), [section]);
  const wide = useWide();

  function choose(next: string) {
    setOpen(next);
    window.history.replaceState(null, "", `?section=${encodeURIComponent(next)}`);
  }

  return (
    <Tabs
      value={open}
      onValueChange={choose}
      orientation={wide ? "vertical" : "horizontal"}
      className="settings-layout"
    >
      <TabsList aria-label="Settings" className="settings-layout__tabs">
        {sections.map(({ id, title }) => (
          <TabsTrigger key={id} value={id}>
            {title}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}

// One section: its heading and what it's for, then its form on a card.
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <TabsContent value={id} forceMount className="settings-layout__panel">
      <section className="settings-layout__section" aria-labelledby={id}>
        <div className="settings-layout__intro">
          <h2 id={id} className="settings-layout__heading">
            {title}
          </h2>
          <p className="settings-layout__text">{description}</p>
        </div>
        <div className="settings-layout__card">{children}</div>
      </section>
    </TabsContent>
  );
}
