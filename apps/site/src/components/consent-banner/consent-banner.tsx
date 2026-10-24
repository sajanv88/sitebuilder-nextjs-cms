// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { Button } from "@nuvui/react";
import { useEffect, useId, useState } from "react";
import { useNonce } from "@/components/nonce-provider/nonce-provider";
import { forgetTrackers, loadTrackers, type Trackers } from "./trackers";
import "./consent-banner.scss";

// The analytics consent banner (Settings → Analytics). Nothing loads until a visitor accepts;
// declining is one press, as accepting is. The choice is kept in this browser, and asked again
// when the site adds a service. After choosing, "Cookie settings" at the foot of the page opens
// it again.

const KEY = "sitebuilder:analytics-consent";

type Choice = "granted" | "denied";

// The services the choice was about: adding one asks again.
const aboutWhat = (names: readonly string[]) => names.join(",");

function stored(names: readonly string[]): Choice | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as {
      choice?: unknown;
      for?: unknown;
    } | null;
    if (saved?.for !== aboutWhat(names)) return null;
    return saved.choice === "granted" || saved.choice === "denied" ? saved.choice : null;
  } catch {
    return null;
  }
}

function store(choice: Choice, names: readonly string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ choice, for: aboutWhat(names) }));
  } catch {
    // Storage blocked: the choice holds for this page only.
  }
}

export function ConsentBanner({
  trackers,
  names,
  privacyPath,
}: {
  trackers: Trackers;
  // The services, as visitors know them: "Google Analytics", "PostHog".
  names: readonly string[];
  privacyPath: string | null;
}) {
  const id = useId();
  const nonce = useNonce();
  // Unknown until the browser has read the stored choice: the server draws nothing.
  const [choice, setChoice] = useState<Choice | null | undefined>(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = stored(names);
    setChoice(saved);
    setOpen(saved === null);
    if (saved === "granted") loadTrackers(trackers, nonce);
  }, [names, trackers, nonce]);

  function choose(next: Choice) {
    store(next, names);
    setOpen(false);
    if (next === "granted") {
      setChoice(next);
      loadTrackers(trackers, nonce);
    } else if (choice === "granted") {
      // The scripts are running: forget what they kept, and load the page again without them.
      forgetTrackers();
      window.location.reload();
    } else {
      setChoice(next);
    }
  }

  if (choice === undefined) return null;
  if (!open) {
    return (
      <div className="consent-banner__reopen">
        <Button intent="ghost" size="sm" onClick={() => setOpen(true)}>
          Cookie settings
        </Button>
      </div>
    );
  }
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  return (
    <section className="consent-banner" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="consent-banner__title">
        Cookies for statistics
      </h2>
      <p className="consent-banner__text">
        {`With your consent, this site uses ${list} to count visits and see how pages are used. They set cookies and send what you do here to those services. Nothing loads unless you accept.`}
        {privacyPath ? (
          <>
            {" "}
            <a href={privacyPath} className="consent-banner__link">
              Read the privacy page
            </a>
            .
          </>
        ) : null}
      </p>
      <div className="consent-banner__actions">
        <Button intent="secondary" onClick={() => choose("denied")}>
          Decline
        </Button>
        <Button intent="secondary" onClick={() => choose("granted")}>
          Accept
        </Button>
      </div>
    </section>
  );
}
