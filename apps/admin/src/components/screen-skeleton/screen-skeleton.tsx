// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { Skeleton, VisuallyHidden } from "@nuvui/react";
import type { ReactNode } from "react";
import { AdminPage } from "@/components/admin-page/admin-page";
import "./screen-skeleton.scss";

// What a screen shows while its data is on the way, after nuvui's page-states block: the real
// header, which needs no data, and gray boxes in the shape of what's coming, so nothing jumps
// when it arrives. Each loading.tsx and Suspense fallback is one of these.

export type SkeletonKind = "dashboard" | "list" | "form" | "media" | "panes";

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

// The rows of a list or a table: a first screen of them.
export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="screen-skeleton__stack">
      <div className="screen-skeleton__toolbar">
        <Skeleton className="screen-skeleton__control screen-skeleton__control--wide" />
        <Skeleton className="screen-skeleton__control" />
      </div>
      <ul className="screen-skeleton__rows">
        {range(rows).map((row) => (
          <li key={row} className="screen-skeleton__row">
            <Skeleton shape="text" className="screen-skeleton__bone" />
            <Skeleton shape="text" className="screen-skeleton__bone screen-skeleton__bone--short" />
          </li>
        ))}
      </ul>
    </div>
  );
}

// The dashboard's four figures.
export function FiguresSkeleton() {
  return (
    <div className="screen-skeleton__figures">
      {range(4).map((figure) => (
        <div key={figure} className="screen-skeleton__figure">
          <Skeleton shape="text" className="screen-skeleton__bone screen-skeleton__bone--short" />
          <Skeleton className="screen-skeleton__number" />
          <Skeleton shape="text" className="screen-skeleton__bone" />
        </div>
      ))}
    </div>
  );
}

// A card of lines, such as recent changes or the setup steps.
export function CardSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="screen-skeleton__card">
      <Skeleton shape="text" className="screen-skeleton__bone screen-skeleton__bone--short" />
      {range(lines).map((line) => (
        <Skeleton key={line} shape="text" className="screen-skeleton__bone" />
      ))}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="screen-skeleton__stack">
      {range(3).map((card) => (
        <div key={card} className="screen-skeleton__card">
          <Skeleton shape="text" className="screen-skeleton__bone screen-skeleton__bone--short" />
          {range(3).map((field) => (
            <div key={field} className="screen-skeleton__field">
              <Skeleton
                shape="text"
                className="screen-skeleton__bone screen-skeleton__bone--short"
              />
              <Skeleton className="screen-skeleton__control screen-skeleton__control--wide" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function MediaSkeleton() {
  return (
    <div className="screen-skeleton__stack">
      <div className="screen-skeleton__toolbar">
        <Skeleton className="screen-skeleton__control screen-skeleton__control--wide" />
        <Skeleton className="screen-skeleton__control" />
      </div>
      <div className="screen-skeleton__tiles">
        {range(12).map((tile) => (
          <Skeleton key={tile} className="screen-skeleton__tile" />
        ))}
      </div>
    </div>
  );
}

function PanesSkeleton() {
  return (
    <div className="screen-skeleton__panes">
      <CardSkeleton lines={6} />
      <CardSkeleton lines={8} />
    </div>
  );
}

const BODIES: Record<SkeletonKind, () => ReactNode> = {
  dashboard: () => (
    <>
      <FiguresSkeleton />
      <div className="screen-skeleton__panes">
        <CardSkeleton lines={5} />
        <CardSkeleton lines={5} />
      </div>
    </>
  ),
  list: () => <RowsSkeleton />,
  form: () => <FormSkeleton />,
  media: () => <MediaSkeleton />,
  panes: () => <PanesSkeleton />,
};

// The region the boxes stand in, marked busy, and a status that says what's loading.
export function Loading({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="screen-skeleton" aria-busy="true">
      {children}
      <VisuallyHidden role="status">{label}</VisuallyHidden>
    </div>
  );
}

// The editor: its bar along the top, then the blocks, the page and the settings side by side
// from lg (only the page below it, the view the editor opens on).
export function EditorSkeleton({ noun }: { noun: string }) {
  return (
    <div className="screen-skeleton screen-skeleton--editor" aria-busy="true">
      <div className="screen-skeleton__head">
        <Skeleton shape="text" className="screen-skeleton__bone screen-skeleton__bone--short" />
        <div className="screen-skeleton__toolbar">
          <Skeleton className="screen-skeleton__title" />
          <div className="screen-skeleton__toolbar">
            <Skeleton className="screen-skeleton__control" />
            <Skeleton className="screen-skeleton__control" />
          </div>
        </div>
      </div>
      <div className="screen-skeleton__editor">
        <div className="screen-skeleton__side">
          <CardSkeleton lines={8} />
        </div>
        <div className="screen-skeleton__stack">
          <Skeleton className="screen-skeleton__control screen-skeleton__control--wide" />
          <div className="screen-skeleton__canvas">
            <Skeleton className="screen-skeleton__hero" />
            {range(4).map((line) => (
              <Skeleton key={line} shape="text" className="screen-skeleton__bone" />
            ))}
          </div>
        </div>
        <div className="screen-skeleton__side">
          <CardSkeleton lines={6} />
        </div>
      </div>
      <VisuallyHidden role="status">{`Loading the ${noun}`}</VisuallyHidden>
    </div>
  );
}

// A whole screen: the header it will have, and the shape of its content.
export function ScreenSkeleton({
  title,
  description,
  kind,
  width,
}: {
  title: string;
  description?: string;
  kind: SkeletonKind;
  width?: "narrow" | "default" | "wide";
}) {
  return (
    <AdminPage
      title={title}
      {...(description ? { description } : {})}
      {...(width ? { width } : {})}
    >
      <Loading label={`Loading ${title.toLowerCase()}`}>{BODIES[kind]()}</Loading>
    </AdminPage>
  );
}
