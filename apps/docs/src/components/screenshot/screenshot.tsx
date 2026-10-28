// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import Image, { type StaticImageData } from "next/image";
import "./screenshot.scss";

// A picture of the admin or the site, taken from a running Sitebuilder. Imported by the page
// (`import shot from "./images/x.png"`), so its size is known and nothing shifts as it loads.
// The alt text says what the picture shows; the caption, when there is one, what to look at.
export function Screenshot({
  src,
  alt,
  caption,
}: {
  src: StaticImageData;
  alt: string;
  caption?: string;
}) {
  return (
    <figure className="screenshot">
      <Image
        src={src}
        alt={alt}
        className="screenshot__image"
        sizes="(min-width: 64rem) 46rem, 100vw"
      />
      {caption ? <figcaption className="screenshot__caption">{caption}</figcaption> : null}
    </figure>
  );
}
