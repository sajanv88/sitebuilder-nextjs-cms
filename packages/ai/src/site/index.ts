// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";

// Designing a site with the assistant (phase 8 plan, 8.0, 8.6): the questions, the plan and the
// pages, and what they need from the caller.

export {
  type BlockSpec,
  type CatalogOptions,
  type FieldSpec,
  type MediaChoice,
  pageCatalog,
} from "./catalog";
export {
  type Answered,
  answersText,
  askQuestions,
  type Catalog,
  type DesignContext,
  type PageJob,
  planSite,
  type StepResult,
  type WrittenPage,
  writePage,
} from "./design";
export { countTodos } from "./facts";
export { PROMPT_VERSION } from "./prompts";
