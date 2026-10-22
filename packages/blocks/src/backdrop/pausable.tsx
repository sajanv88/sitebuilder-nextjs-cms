// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { PauseIcon, PlayIcon } from "@nuvui/icons";
import { Button } from "@nuvui/react";
import { type ComponentType, type ReactNode, useState } from "react";

// A moving backdrop with a way to stop it: anything that moves by itself for more than five
// seconds beside other content needs one (WCAG 2.2.2). The button keeps its name and says
// whether it's pressed, as nuvui's backgrounds page does it.

export interface BackdropFrameProps {
  className: string;
  scrim: "soft" | "strong";
  children: ReactNode;
}

interface MovingProps {
  className?: string;
  scrim?: "none" | "soft" | "strong";
  paused?: boolean;
  children?: ReactNode;
}

export function pausable(
  Background: ComponentType<MovingProps>,
): ComponentType<BackdropFrameProps> {
  function Pausable({ className, scrim, children }: BackdropFrameProps) {
    const [paused, setPaused] = useState(false);
    return (
      <Background className={className} scrim={scrim} paused={paused}>
        {children}
        <span className="block-backdrop__pause">
          <Button
            intent="secondary"
            size="sm"
            aria-pressed={paused}
            onClick={() => setPaused((now) => !now)}
          >
            {paused ? (
              <PlayIcon aria-hidden="true" size={16} />
            ) : (
              <PauseIcon aria-hidden="true" size={16} />
            )}
            Pause the background
          </Button>
        </span>
      </Background>
    );
  }
  return Pausable;
}
