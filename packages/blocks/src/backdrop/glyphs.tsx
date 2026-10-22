// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { GlyphBackground } from "@nuvui/backgrounds/glyph-background";
import { withMotion } from "./motion";

// Its own module, so a page loads only the backdrop it shows.
export const GlyphBackdrop = withMotion(GlyphBackground);
