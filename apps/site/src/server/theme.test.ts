// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { fontsStylesheet } = await import("./theme");

// The CSS for uploaded fonts (decisions #148).

const id = (n: number) => `${n}1111111-1111-4111-8111-111111111111`;

describe("uploaded fonts", () => {
  it("are declared, file by file, and set as the text's and code's font", () => {
    const css = fontsStylesheet(
      [
        {
          family: "Inter",
          files: [
            { mediaId: id(1), weight: "100 900", style: "normal" },
            { mediaId: id(2), weight: "400", style: "italic" },
          ],
          use: "text",
        },
        {
          family: "Fira Code",
          files: [{ mediaId: id(3), weight: "400", style: "normal" }],
          use: "code",
        },
      ],
      {
        [id(1)]: "/media/2026/10/a-inter.woff2",
        [id(2)]: "/media/2026/10/b-inter-italic.woff2",
        [id(3)]: "/media/2026/10/c-fira.woff2",
      },
    );
    expect(css).toContain(
      '@font-face{font-family:"Inter";src:url("/media/2026/10/a-inter.woff2") format("woff2");font-weight:100 900;font-style:normal;font-display:swap}',
    );
    expect(css).toContain("font-style:italic");
    expect(css).toContain(
      ':root{--font-sans:"Inter", system-ui, sans-serif;--font-mono:"Fira Code", ui-monospace, monospace}',
    );
  });

  it("leaves out a deleted file, a family left with none, and anything not as it should be", () => {
    const css = fontsStylesheet(
      [
        {
          family: "Gone",
          files: [{ mediaId: id(4), weight: "400", style: "normal" }],
          use: "text",
        },
        {
          family: 'Bad"',
          files: [{ mediaId: id(5), weight: "400", style: "normal" }],
          use: "code",
        },
        { family: "Odd", files: [{ mediaId: id(6), weight: "400", style: "normal" }], use: "code" },
      ],
      { [id(5)]: "/media/x.woff2", [id(6)]: 'https://evil.example.com/x.woff2");}' },
    );
    expect(css).toBe("");
  });
});
