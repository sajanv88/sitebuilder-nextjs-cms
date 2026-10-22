// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import type { ComponentType, ReactNode } from "react";

// A backdrop that moves only when the admin chose Moving; otherwise it's one frame that holds
// still. Anyone who asked for less motion gets the still frame either way (nuvui's backgrounds).
// There's no pause button: the owner's call, with movement off unless chosen (decisions #108).

export interface BackdropFrameProps {
  className: string;
  scrim: "soft" | "strong";
  moving: boolean;
  children: ReactNode;
}

interface MovingProps {
  className?: string;
  scrim?: "none" | "soft" | "strong";
  paused?: boolean;
  children?: ReactNode;
}

export function withMotion(
  Background: ComponentType<MovingProps>,
): ComponentType<BackdropFrameProps> {
  function Moving({ className, scrim, moving, children }: BackdropFrameProps) {
    return (
      <Background className={className} scrim={scrim} paused={!moving}>
        {children}
      </Background>
    );
  }
  return Moving;
}
