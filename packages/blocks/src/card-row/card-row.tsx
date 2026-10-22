// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import {
  Carousel,
  CarouselContent,
  CarouselDots,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@nuvui/react";
import type { ReactNode } from "react";
import * as v from "valibot";
import type { Field } from "../types";
import "./card-row.scss";

// Cards side by side as a grid, every one in view, or as a carousel that shows one, two or
// three at a time by the width it has (nuvui's Carousel, after its case-studies block). Used
// by Reviews and Feature grid.

export const layoutProp = v.optional(v.picklist(["grid", "carousel"]), "grid");

export const layoutField: Field = {
  kind: "choice",
  name: "layout",
  label: "Layout",
  description: "A carousel hides most cards: keep what everyone must see in a grid.",
  options: [
    { value: "grid", label: "Grid: all at once" },
    { value: "carousel", label: "Carousel: a few at a time" },
  ],
};

export function CardRow({
  layout,
  label,
  className,
  cards,
}: {
  layout: "grid" | "carousel";
  // The carousel's name, such as "Reviews". A screen reader adds "carousel".
  label: string;
  // The grid's own class (its columns and gap).
  className: string;
  cards: { key: string; card: ReactNode }[];
}) {
  if (layout === "grid") {
    return (
      <ul className={className}>
        {cards.map(({ key, card }) => (
          <li key={key}>{card}</li>
        ))}
      </ul>
    );
  }
  return (
    <Carousel aria-label={label} options={{ align: "start" }} className="card-row">
      <CarouselContent>
        {cards.map(({ key, card }) => (
          <CarouselItem key={key} className="card-row__slide">
            {card}
          </CarouselItem>
        ))}
      </CarouselContent>
      <div className="card-row__controls">
        <CarouselPrevious />
        <CarouselDots />
        <CarouselNext />
      </div>
    </Carousel>
  );
}
