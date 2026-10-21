import type { Block, BlockList as Blocks } from "@sitebuilder/schema";
import { renderToStaticMarkup } from "react-dom/server";
import * as v from "valibot";
import { describe, expect, test, vi } from "vitest";

// server.ts is server-only; under vitest there's no React server condition to satisfy.
vi.mock("server-only", () => ({}));

const { collectEntryIds, collectMediaIds, cloneBlock, createBlock } = await import("./content");
const { allowedChildren, BLOCKS, blockRules, LEAF_TYPES } = await import("./registry");
const { BlockList } = await import("./render");
const { sanitizeRichText, validateContent } = await import("./server");

const IMAGE = "11111111-1111-4111-8111-111111111111";
const VIDEO = "22222222-2222-4222-8222-222222222222";
const PAGE = "33333333-3333-4333-8333-333333333333";

const context = {
  media: (id: string) =>
    id === IMAGE
      ? {
          id,
          url: "/media/2026/10/x-photo.jpg",
          mimeType: "image/jpeg" as const,
          width: 800,
          height: 600,
          alt: "A photo",
          filename: "photo.jpg",
          sizeBytes: 2048,
        }
      : undefined,
  href: (target: { kind: "entry"; entryId: string } | { kind: "url"; url: string }) =>
    target.kind === "url" ? target.url : target.entryId === PAGE ? "/about" : undefined,
  posts: [],
  editing: false,
};

let n = 0;
const block = (type: string, props: Record<string, unknown>, children?: Block[]): Block => ({
  id: `block-${String(++n).padStart(6, "0")}`,
  type,
  props,
  ...(children ? { children } : {}),
});

// A landing page: hero, a section of features, columns with an image and text, pricing, FAQ.
const landing: Blocks = [
  block("hero", {
    headline: "Websites without the busywork",
    body: "Build pages from blocks.",
    primaryAction: { label: "Start", href: { kind: "entry", entryId: PAGE } },
    imageMediaId: IMAGE,
  }),
  block("section", { width: "wide", background: "muted", paddingY: "lg" }, [
    block("heading", { text: "Why it works", level: 2 }),
    block("feature-grid", {
      items: [
        { icon: "zap", title: "Fast", text: "Pages are cached." },
        { icon: "shield", title: "Safe", text: "Every input is checked." },
      ],
    }),
  ]),
  block("columns", { gap: "lg" }, [
    block("column", {}, [block("image", { mediaId: IMAGE, caption: "Our office" })]),
    block("column", {}, [
      block("rich-text", { html: "<p>Hello <strong>there</strong></p><script>alert(1)</script>" }),
    ]),
  ]),
  block("pricing", {
    plans: [
      {
        name: "Team",
        price: "$12",
        period: "a month",
        features: ["Unlimited pages"],
        cta: { label: "Choose", href: { kind: "url", url: "/signup" } },
        highlighted: true,
      },
    ],
  }),
  block("faq", { items: [{ question: "Is it free?", answer: "It's open source." }] }),
  block("video", { mediaId: VIDEO, title: "A tour" }),
];

describe("the registry", () => {
  test("has the design's block set, each with a strict schema", () => {
    expect(BLOCKS.map((d) => d.type).sort()).toEqual(
      [
        "button",
        "callout",
        "column",
        "columns",
        "faq",
        "feature-grid",
        "file-download",
        "gallery",
        "heading",
        "hero",
        "image",
        "latest-posts",
        "pricing",
        "quote",
        "reviews",
        "rich-text",
        "section",
        "separator",
        "spacer",
        "table",
        "video",
      ].sort(),
    );
    for (const definition of BLOCKS) {
      const defaults = definition.defaults();
      expect(
        v.safeParse(definition.props, { ...defaults, unknownProp: 1 }).success,
        definition.type,
      ).toBe(false);
    }
  });

  test("defaults are valid, except a file that hasn't been chosen yet", () => {
    const needsAFile = new Set(["image", "gallery", "video", "file-download"]);
    for (const definition of BLOCKS) {
      const ok = v.safeParse(definition.props, definition.defaults()).success;
      expect(ok, definition.type).toBe(!needsAFile.has(definition.type));
    }
  });

  test("containers follow design §5.2", () => {
    expect(blockRules.columns?.container).toEqual({ allow: ["column"], min: 2, max: 4 });
    expect(blockRules.section?.container?.allow).toEqual(LEAF_TYPES);
    expect(LEAF_TYPES).not.toContain("columns");
    expect(LEAF_TYPES).not.toContain("section");
    expect(allowedChildren(null)).not.toContain("column");
    expect(allowedChildren("columns")).toEqual(["column"]);
  });
});

describe("validateContent", () => {
  test("a landing page round-trips, with its rich text cleaned", () => {
    const result = validateContent(landing);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const html = result.value[2]?.children?.[1]?.children?.[0]?.props.html;
    expect(html).toBe("<p>Hello <strong>there</strong></p>");
    // Parsing again changes nothing.
    expect(validateContent(result.value)).toEqual({ ok: true, value: result.value });
  });

  test("refuses bad props, an icon outside the list, and a table row of the wrong length", () => {
    const issues = (blocks: Blocks) => {
      const result = validateContent(blocks);
      return result.ok ? [] : result.issues.map((issue) => issue.code);
    };
    expect(issues([block("heading", { text: "", level: 2 })])).toEqual(["invalid-props"]);
    expect(
      issues([block("feature-grid", { items: [{ icon: "skull", title: "x", text: "y" }] })]),
    ).toEqual(["invalid-props"]);
    expect(
      issues([block("table", { caption: "T", columns: ["A", "B"], rows: [["only one"]] })]),
    ).toEqual(["invalid-props"]);
    expect(
      issues([block("button", { label: "Go", href: { kind: "url", url: "javascript:alert(1)" } })]),
    ).toEqual(["invalid-props"]);
    // Columns hold only column blocks; a section can't hold columns (3 levels at most).
    expect(issues([block("section", {}, [block("columns", {}, [])])])).toContain(
      "child-type-not-allowed",
    );
  });
});

describe("sanitizeRichText", () => {
  test("keeps what the editor writes and drops anything that runs", () => {
    expect(
      sanitizeRichText('<p onclick="x()">Hi <a href="https://example.com">there</a></p>'),
    ).toBe('<p>Hi <a href="https://example.com">there</a></p>');
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeRichText('<a href="//evil.example">x</a>')).toBe("<a>x</a>");
    expect(sanitizeRichText('<img src=x onerror="alert(1)"><iframe src="x"></iframe>')).toBe("");
    expect(sanitizeRichText('<p style="color:red" class="x">t</p>')).toBe("<p>t</p>");
    expect(sanitizeRichText('<a href="/about" target="_blank">x</a>')).toBe(
      '<a href="/about" target="_blank" rel="noopener noreferrer">x</a>',
    );
  });
});

describe("content helpers", () => {
  test("collect the media and entries a page uses, however deep", () => {
    expect(collectMediaIds(landing).sort()).toEqual([IMAGE, VIDEO].sort());
    expect(collectEntryIds(landing)).toEqual([PAGE]);
  });

  test("new blocks have fresh ids; columns start with two columns; a clone renames everything", () => {
    const created = createBlock("columns");
    expect(created.children?.map((child) => child.type)).toEqual(["column", "column"]);
    expect(created.id).toMatch(/^[A-Za-z0-9]{16}$/);
    const copy = cloneBlock(created);
    expect(copy.id).not.toBe(created.id);
    expect(copy.children?.[0]?.id).not.toBe(created.children?.[0]?.id);
    expect(copy.props).toEqual(created.props);
  });
});

describe("BlockList", () => {
  test("draws a page on the server, skipping what can't be shown", () => {
    const result = validateContent(landing);
    if (!result.ok) throw new Error("landing page");
    const html = renderToStaticMarkup(<BlockList blocks={result.value} context={context} />);
    expect(html).toContain("Websites without the busywork");
    expect(html).toContain('href="/about"');
    expect(html).toContain('src="/media/2026/10/x-photo.jpg"');
    expect(html).toContain("<figcaption");
    expect(html).toContain("<strong>there</strong>");
    expect(html).not.toContain("<script");
    // The video's file isn't in the context: visitors get nothing, not a broken player.
    expect(html).not.toContain("A tour");
  });

  test("in the editor, a block with nothing to show yet draws a placeholder", () => {
    const html = renderToStaticMarkup(
      <BlockList blocks={[createBlock("image")]} context={{ ...context, editing: true }} />,
    );
    expect(html).toContain("Choose an image");
  });
});
