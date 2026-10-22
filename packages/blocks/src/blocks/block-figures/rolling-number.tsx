// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { AnimatedNumber } from "@nuvui/react";
import { useEffect, useRef, useState } from "react";

// A figure that rolls up from zero the first time it scrolls into view. The page from the server
// has the real number, for readers, search engines and anyone without the script. A figure
// already in view when the page opens stays as it is, so nothing visible jumps to zero; one
// below the fold is set to zero out of sight, then rolls. AnimatedNumber holds still for
// anyone who asked for less motion.
export function RollingNumber({
  value,
  locale,
  maximumFractionDigits,
}: {
  value: number;
  locale: string;
  maximumFractionDigits: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const box = element.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) return;
    setShown(0);
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShown(value);
        observer.disconnect();
      },
      { threshold: 0.6 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [value]);

  return (
    <span ref={ref}>
      <AnimatedNumber value={shown} locale={locale} maximumFractionDigits={maximumFractionDigits} />
    </span>
  );
}
