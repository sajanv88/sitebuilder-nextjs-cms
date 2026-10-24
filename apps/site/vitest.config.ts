// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests resolve the app's "@/" imports as Next.js does (tsconfig paths).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
