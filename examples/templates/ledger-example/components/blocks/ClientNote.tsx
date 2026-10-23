// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { defineBlock } from "@sitebuilder/template-sdk";
import Image from "next/image";

// A client's words, with their name and role, between two rules, and their photo when one is
// chosen. Drawn on the server for the site and in the browser for the editor's canvas.

type Props = {
  quote: string;
  name: string;
  role?: string;
  photoMediaId?: string;
};

export default defineBlock<Props>(({ props, media }) => {
  const photo = props.photoMediaId ? media(props.photoMediaId) : undefined;
  return (
    <figure className="ledger-note">
      <blockquote className="ledger-note__quote">
        <p>{props.quote}</p>
      </blockquote>
      <figcaption className="ledger-note__who">
        {photo ? (
          // Beside the name, so it's decoration (alt="").
          <Image
            className="ledger-note__photo"
            src={photo.src}
            alt=""
            width={48}
            height={48}
            sizes="48px"
          />
        ) : null}
        <span>
          <span className="ledger-note__name">{props.name}</span>
          {props.role ? <span className="ledger-note__role">{props.role}</span> : null}
        </span>
      </figcaption>
    </figure>
  );
});
