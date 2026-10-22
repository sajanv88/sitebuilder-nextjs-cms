// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";
import { registerTemplateBlocks } from "@sitebuilder/blocks";
import { installedTemplateBlocks } from "@sitebuilder/templates/blocks";

// Every installed template's block types, registered once, before any content is read or
// drawn: imported for this by the modules that do (content.ts, template.ts). A block of a
// template that isn't active is known, and draws nothing (decisions #112).
registerTemplateBlocks(installedTemplateBlocks());
