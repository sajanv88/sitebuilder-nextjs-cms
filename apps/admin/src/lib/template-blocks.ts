// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { registerTemplateBlocks } from "@sitebuilder/blocks";
import { installedTemplateBlocks } from "@sitebuilder/templates/blocks";

// Every installed template's block types, from data (no template code), registered once in each
// place the admin checks or edits content: imported for this by the save actions on the server
// and by the editor in the browser. Content may hold any installed template's blocks; the
// inserter offers the active one's (decisions #112).
registerTemplateBlocks(installedTemplateBlocks());
