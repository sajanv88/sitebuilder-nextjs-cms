// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { defineBlock } from "@sitebuilder/template-sdk";

export default defineBlock<{ quote: string; photoMediaId?: string }>(({ props, media }) => {
  const photo = props.photoMediaId ? media(props.photoMediaId) : undefined;
  return (
    <figure>
      <blockquote>{props.quote}</blockquote>
      {photo ? <figcaption>{photo.alt}</figcaption> : null}
    </figure>
  );
});
