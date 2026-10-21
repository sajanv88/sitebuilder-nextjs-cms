"use client";

import { ArrowUpDownIcon } from "@nuvui/icons";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  TableOfContents,
  type TableOfContentsItem,
} from "@nuvui/react";
import type { ReactNode } from "react";
import "./settings-layout.scss";

// A page of settings sections, after nuvui's article block: the sections down the page, and a
// list of them beside it that marks the one being read (behind a button on a narrow screen).
// Each section is a SettingsSection.

export function SettingsLayout({
  sections,
  children,
}: {
  sections: TableOfContentsItem[];
  children: ReactNode;
}) {
  return (
    <div className="settings-layout">
      <div className="settings-layout__main">
        {/* On a narrow screen the list is behind a button, above the sections. */}
        <Collapsible className="settings-layout__drawer">
          <CollapsibleTrigger asChild>
            <Button intent="secondary" className="settings-layout__toggle">
              On this page
              <ArrowUpDownIcon aria-hidden="true" size={16} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <TableOfContents
              aria-label="On this page"
              items={sections}
              className="settings-layout__contents"
            />
          </CollapsibleContent>
        </Collapsible>
        {children}
      </div>
      {/* Beside the sections on a wide screen, where it stays in view. */}
      <aside className="settings-layout__side">
        <p className="settings-layout__label" id="settings-layout-contents">
          On this page
        </p>
        <TableOfContents aria-labelledby="settings-layout-contents" items={sections} offset={120} />
      </aside>
    </div>
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
    <section className="settings-layout__section" aria-labelledby={id}>
      <div className="settings-layout__intro">
        <h2 id={id} className="settings-layout__heading">
          {title}
        </h2>
        <p className="settings-layout__text">{description}</p>
      </div>
      <div className="settings-layout__card">{children}</div>
    </section>
  );
}
