// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { CheckCircleIcon, CircleIcon } from "@nuvui/icons";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
  VisuallyHidden,
} from "@nuvui/react";
import type { Route } from "next";
import Link from "next/link";
import "./setup-steps.scss";

// "Get started" on the dashboard, after nuvui's setup-checklist block. Each step is worked out
// from the site as it is, not ticked by hand, so it can't say done when it isn't.

export interface SetupStep {
  id: string;
  title: string;
  text: string;
  done: boolean;
  href: Route;
  action: string;
}

export function SetupSteps({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((step) => step.done).length;
  return (
    <Card className="setup-steps">
      <CardHeader>
        <CardTitle asChild>
          <h2>Get started</h2>
        </CardTitle>
        <CardDescription>A few steps to a site ready for visitors.</CardDescription>
      </CardHeader>
      <CardContent className="setup-steps__body">
        <div className="setup-steps__progress">
          <span className="setup-steps__count" id="setup-steps-count">
            {done} of {steps.length} done
          </span>
          <Progress value={(done / steps.length) * 100} aria-labelledby="setup-steps-count" />
        </div>
        <ul className="setup-steps__list">
          {steps.map((step) => (
            <li key={step.id} className="setup-steps__step">
              {step.done ? (
                <CheckCircleIcon aria-hidden="true" size={20} className="setup-steps__done" />
              ) : (
                <CircleIcon aria-hidden="true" size={20} className="setup-steps__todo" />
              )}
              <div className="setup-steps__words">
                <span className="setup-steps__name">
                  {step.title}
                  {/* The icon's meaning, in words. */}
                  <VisuallyHidden>{step.done ? ", done" : ", to do"}</VisuallyHidden>
                </span>
                <span className="setup-steps__hint">{step.text}</span>
              </div>
              {step.done ? null : (
                <Button asChild intent="secondary" size="sm">
                  <Link href={step.href}>{step.action}</Link>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
