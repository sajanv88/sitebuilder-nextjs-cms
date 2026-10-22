// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// Copies the templates' compiled stylesheets and the files they point at, which `generate` wrote
// to templates/generated/public/_templates, into public/_templates, where the site serves them.
// Run before `next dev` and `next build`; the old copy goes first, so a stale hash is never
// served. `generate` writes outside this app's folder because Turbo restores a task's outputs
// only from inside its own package.

import { cpSync, existsSync, rmSync } from "node:fs";

const from = "../../templates/generated/public/_templates";
const to = "public/_templates";

rmSync(to, { recursive: true, force: true });
if (existsSync(from)) cpSync(from, to, { recursive: true });
