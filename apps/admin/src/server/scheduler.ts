// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import { db, publishDueEntries } from "@sitebuilder/db";

const EVERY_MS = 60_000;

// Kept on globalThis so `next dev` reloading this module doesn't start a second timer.
const started = Symbol.for("sitebuilder.scheduler");
const flags = globalThis as typeof globalThis & { [started]?: boolean };

async function tick(): Promise<void> {
  try {
    await publishDueEntries(db);
  } catch (error) {
    // The next tick tries again; a database that's down for a minute delays posts, nothing else.
    console.error(
      JSON.stringify({
        level: "error",
        msg: "publishing scheduled entries failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

// Scheduled posts go live from here: every admin process checks once a minute, in Compose and
// in Kubernetes alike, so no CronJob is needed (decisions #75). publishDueEntries publishes
// each entry once however many processes run it.
export function startScheduler(): void {
  if (flags[started]) return;
  flags[started] = true;
  // unref: the timer never keeps a stopping process alive.
  setInterval(() => void tick(), EVERY_MS).unref();
  void tick();
}
