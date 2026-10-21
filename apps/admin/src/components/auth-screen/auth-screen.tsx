// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { ReactNode } from "react";
import "./auth-screen.scss";

// The frame of the screens a signed-out person sees: sign-in and first-time setup. From
// nuvui's sign-in block, without the brand panel.
export function AuthScreen({
  title,
  intro,
  children,
}: {
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="auth-screen">
      <div className="auth-screen__box">
        <p className="auth-screen__brand">Sitebuilder</p>
        <div className="auth-screen__intro">
          <h1 className="auth-screen__title">{title}</h1>
          <p className="auth-screen__text">{intro}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
