// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { Block, BlockList as Blocks } from "@sitebuilder/schema";
import { renderToStaticMarkup } from "react-dom/server";
import * as v from "valibot";
import { describe, expect, test, vi } from "vitest";

// server.ts is server-only; under vitest there's no React server condition to satisfy.
vi.mock("server-only", () => ({}));

const { collectEntryIds, collectMediaIds, cloneBlock, createBlock, headingBlockId } = await import(
  "./content"
);
const {
  allowedChildren,
  BLOCKS,
  blockRules,
  getBlockDefinition,
  leafTypes,
  registerTemplateBlocks,
} = await import("./registry");
const { templateBlockDefinition } = await import("./template-block");
const { BlockList } = await import("./render");
const { canvasMessage, isEditorKey } = await import("./canvas");
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
  dates: { dateFormat: "dd/MM/yyyy" as const, timeZone: "Europe/London", language: "en" },
  headingBlockId: null as string | null,
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
  test("has the design's block set and the additions, each with a strict schema", () => {
    expect(BLOCKS.map((d) => d.type).sort()).toEqual(
      [
        "button",
        "callout",
        "column",
        "columns",
        "compare",
        "faq",
        "feature-grid",
        "figures",
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
        "timeline",
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
    const needsAFile = new Set(["image", "gallery", "video", "file-download", "compare"]);
    for (const definition of BLOCKS) {
      const ok = v.safeParse(definition.props, definition.defaults()).success;
      expect(ok, definition.type).toBe(!needsAFile.has(definition.type));
    }
  });

  test("containers follow design §5.2", () => {
    expect(blockRules().columns?.container).toEqual({ allow: ["column"], min: 2, max: 4 });
    expect(blockRules().section?.container?.allow).toEqual(leafTypes());
    expect(leafTypes()).not.toContain("columns");
    expect(leafTypes()).not.toContain("section");
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

  test("gives a hero that opens the page the h1, and an h2 anywhere else", () => {
    const hero = block("hero", { headline: "Big news" });
    const lead = renderToStaticMarkup(
      <BlockList
        blocks={[hero]}
        context={{ ...context, headingBlockId: headingBlockId([hero]) }}
      />,
    );
    expect(lead).toContain('<h1 class="block-hero__title">Big news</h1>');
    const later = [block("separator", {}), hero];
    expect(headingBlockId(later)).toBeNull();
    expect(renderToStaticMarkup(<BlockList blocks={later} context={context} />)).toContain(
      '<h2 class="block-hero__title">Big news</h2>',
    );
  });

  test("draws pictures with the zone's own image component when it has one", () => {
    const html = renderToStaticMarkup(
      <BlockList
        blocks={[block("image", { mediaId: IMAGE })]}
        context={{
          ...context,
          image: ({ media, sizes }) => <span data-src={media.url} data-sizes={sizes} />,
        }}
      />,
    );
    expect(html).toContain('data-src="/media/2026/10/x-photo.jpg"');
    expect(html).not.toContain("<img");
  });

  test("in the editor, a block with nothing to show yet draws a placeholder", () => {
    const html = renderToStaticMarkup(
      <BlockList blocks={[createBlock("image")]} context={{ ...context, editing: true }} />,
    );
    expect(html).toContain("Choose an image");
  });
});

describe("the blocks added with nuvui 0.8", () => {
  const AFTER = "44444444-4444-4444-8444-444444444444";
  const withAfter = {
    ...context,
    media: (id: string) =>
      id === AFTER
        ? {
            ...(context.media(IMAGE) as NonNullable<ReturnType<typeof context.media>>),
            id,
            alt: "After",
          }
        : context.media(id),
  };
  const draw = (blocks: Blocks, ctx = withAfter) => {
    const result = validateContent(blocks);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    return renderToStaticMarkup(<BlockList blocks={result.value} context={ctx} />);
  };

  test("a section and a hero take a backdrop, drawn in place of the background color", () => {
    const html = draw([
      block("section", { background: "muted", backdrop: "stars", scrim: "soft" }, [
        block("heading", { text: "Over the stars", level: 2 }),
      ]),
      block("hero", { headline: "On a grid", backdrop: "grid" }),
    ]);
    expect(html).toContain("block-section--backdrop");
    expect(html).not.toContain("block-section--bg-muted");
    expect(html).toContain("Over the stars");
    // Still unless an admin chose Moving, so there's no pause button (decisions #108).
    expect(html).not.toContain("Pause the background");
    expect(html).toContain("block-hero__backdrop");
    expect(validateContent([block("hero", { headline: "x", motion: "moving" })]).ok).toBe(true);
    expect(validateContent([block("hero", { headline: "x", motion: "spinning" })]).ok).toBe(false);
    // Fireworks aren't offered.
    expect(validateContent([block("section", { backdrop: "fireworks" }, [])]).ok).toBe(false);
  });

  test("a block on the page runs contained, fluid or full width; inside another, it fills that", () => {
    const html = draw([
      block("image", { mediaId: IMAGE, pageWidth: "full" }),
      block("hero", { headline: "Wide", pageWidth: "fluid" }),
      block("section", { pageWidth: "full" }, [
        block("image", { mediaId: IMAGE, pageWidth: "full" }),
      ]),
      block("columns", { pageWidth: "contained" }, [
        block("column", {}, [block("heading", { text: "One", level: 2 })]),
        block("column", {}, [block("heading", { text: "Two", level: 2 })]),
      ]),
    ]);
    // The full-width image, the fluid hero and the full-width section; not the image inside the
    // section, and nothing for contained columns.
    expect(html.match(/block-page__item--full/g)).toHaveLength(2);
    expect(html.match(/block-page__item--fluid/g)).toHaveLength(1);
    expect(html.match(/block-image--edge/g)).toHaveLength(1);
    // Stored blocks without the prop are contained.
    expect(draw([block("image", { mediaId: IMAGE })])).not.toContain("block-page__item");
    expect(
      validateContent([block("video", { mediaId: VIDEO, title: "x", pageWidth: "wide" })]).ok,
    ).toBe(false);
  });

  test("the editor's frame gets the width of a block on the page, and contained inside one", () => {
    const seen: [string, string][] = [];
    const Frame = ({
      block: framed,
      pageWidth,
      children,
    }: {
      block: Block;
      pageWidth: string;
      children: React.ReactNode;
    }) => {
      seen.push([framed.type, pageWidth]);
      return <div>{children}</div>;
    };
    renderToStaticMarkup(
      <BlockList
        blocks={[
          block("section", { pageWidth: "fluid" }, [
            block("image", { mediaId: IMAGE, pageWidth: "full" }),
          ]),
        ]}
        context={{ ...withAfter, editing: true }}
        frame={Frame as never}
      />,
    );
    expect(seen).toEqual([
      ["section", "fluid"],
      ["image", "contained"],
    ]);
  });

  test("compare draws both pictures and says what changed; its files count as used", () => {
    const compare = block("compare", {
      beforeMediaId: IMAGE,
      afterMediaId: AFTER,
      beforeAlt: "The old kitchen",
      caption: "New cabinets and a window",
    });
    const html = draw([compare]);
    expect(html).toContain('alt="The old kitchen"');
    expect(html).toContain('alt="After"');
    expect(html).toContain("New cabinets and a window");
    expect(collectMediaIds([compare]).sort()).toEqual([IMAGE, AFTER].sort());
    // Without its files, visitors get nothing and the editor a placeholder.
    const missing = [block("compare", { beforeMediaId: IMAGE, afterMediaId: VIDEO })];
    expect(draw(missing)).toBe("");
    expect(draw(missing, { ...withAfter, editing: true })).toContain(
      "Choose a before and an after",
    );
  });

  test("figures write the real number on the server; a timeline dates only what is a date", () => {
    const html = draw([
      block("figures", {
        items: [{ value: 12000, suffix: "+", label: "Customers" }],
        animate: true,
      }),
      block("timeline", {
        items: [
          { date: "2019", title: "Founded" },
          { date: "Spring 2025", title: "Moved" },
        ],
      }),
    ]);
    expect(html).toContain("12,000");
    expect(html).toContain("Customers");
    expect(html).toMatch(/<time [^>]*dateTime="2019"/);
    expect(html).not.toContain('dateTime="Spring 2025"');
    expect(validateContent([block("figures", { items: [] })]).ok).toBe(false);
  });

  test("reviews and features can be a carousel", () => {
    const html = draw([
      block("reviews", {
        layout: "carousel",
        items: [{ quote: "Lovely.", author: "Ana" }],
      }),
    ]);
    expect(html).toContain('aria-label="Reviews"');
    expect(html).toContain("Lovely.");
    expect(validateContent([block("reviews", { layout: "slideshow", items: [] })]).ok).toBe(false);
  });
});

describe("alignment", () => {
  const draw = (blocks: Blocks) => {
    const result = validateContent(blocks);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    return renderToStaticMarkup(<BlockList blocks={result.value} context={context} />);
  };

  test("a block set to an alignment carries it; one left unset follows its section", () => {
    const html = draw([
      block("section", { align: "center" }, [
        block("rich-text", { html: "<p>Follows the section</p>" }),
        block("button", {
          label: "Go",
          href: { kind: "url", url: "/" },
          align: "end",
        }),
      ]),
    ]);
    expect(html).toContain('class="block-section__inner block-align--center"');
    expect(html).toContain('class="block-rich-text"');
    expect(html).toContain('class="block-button block-align--end"');
  });

  test("heroes stay centered unless set, and older headings keep their stored start", () => {
    expect(draw([block("hero", { headline: "Hi" })])).toContain("block-align--center");
    expect(draw([block("heading", { text: "Old", level: 2, align: "start" })])).toContain(
      "block-align--start",
    );
    expect(validateContent([block("heading", { text: "x", align: "middle" })]).ok).toBe(false);
  });

  test("a picture at its own size can be aligned; one in a set shape fills its column", () => {
    const natural = draw([block("image", { mediaId: IMAGE, align: "center" })]);
    expect(natural).toContain("block-image--natural");
    const shaped = draw([block("image", { mediaId: IMAGE, ratio: "16:9", align: "center" })]);
    expect(shaped).not.toContain("block-image--natural");
  });
});

describe("template blocks", () => {
  // As template.json declares it (decisions #112).
  const testimonial = templateBlockDefinition("studio", "Studio", {
    name: "testimonial",
    label: "Testimonial",
    description: "A quote with a photo of who said it.",
    category: "marketing",
    icon: "star",
    component: "components/blocks/Testimonial.tsx",
    fields: [
      { name: "quote", label: "Quote", kind: "text", max: 300 },
      { name: "author", label: "Who said it", kind: "text", max: 80, optional: true },
      { name: "photoMediaId", label: "Photo", kind: "media", accept: "image", optional: true },
      {
        name: "tone",
        label: "Tone",
        kind: "choice",
        options: [
          { value: "plain", label: "Plain" },
          { value: "bold", label: "Bold" },
        ],
      },
    ],
    defaults: { quote: "Words a customer said.", tone: "plain" },
    summaryField: "quote",
  });

  test("its type is namespaced, and its props are checked by the declared fields", () => {
    expect(testimonial.type).toBe("studio:testimonial");
    expect(v.parse(testimonial.props, testimonial.defaults())).toEqual({
      quote: "Words a customer said.",
      tone: "plain",
    });
    // A block stored before "tone" existed gets its default.
    expect(v.parse(testimonial.props, { quote: "Hi" })).toEqual({ quote: "Hi", tone: "plain" });
    expect(v.is(testimonial.props, { quote: "Hi", colour: "red" })).toBe(false);
    expect(v.is(testimonial.props, { quote: "Hi", photoMediaId: "photo.jpg" })).toBe(false);
    expect(v.is(testimonial.props, { quote: "Hi", tone: "loud" })).toBe(false);
    expect(testimonial.summary({ quote: "Great work" })).toBe("Great work");
  });

  test("registered, content may use it, in a section too; unregistered, it's refused", () => {
    const content = [
      block("studio:testimonial", { quote: "Great work" }),
      block("section", {}, [block("studio:testimonial", { quote: "Again" })]),
    ];
    expect(validateContent(content).ok).toBe(false);
    registerTemplateBlocks([testimonial]);
    try {
      expect(validateContent(content).ok).toBe(true);
      expect(getBlockDefinition("studio:testimonial")?.label).toBe("Testimonial");
      expect(allowedChildren("section")).toContain("studio:testimonial");
    } finally {
      registerTemplateBlocks([]);
    }
    expect(getBlockDefinition("studio:testimonial")).toBeUndefined();
  });

  test("drawn by the component the site hands over; otherwise nothing, or a placeholder", () => {
    registerTemplateBlocks([testimonial]);
    try {
      const blocks = [block("studio:testimonial", { quote: "Great work", photoMediaId: IMAGE })];
      const Quote = ({
        props,
        media,
      }: {
        props: Record<string, unknown>;
        media: (id: string) => { src: string; alt: string } | undefined;
      }) => (
        <blockquote cite={media(String(props.photoMediaId))?.src}>{String(props.quote)}</blockquote>
      );
      const drawn = renderToStaticMarkup(
        <BlockList
          blocks={blocks}
          context={{
            ...context,
            templateBlock: (type) => (type === "studio:testimonial" ? (Quote as never) : undefined),
          }}
        />,
      );
      expect(drawn).toContain('<blockquote cite="/media/2026/10/x-photo.jpg">Great work');
      // The site reads its picture with the page's, by the field's name.
      expect(collectMediaIds(blocks)).toEqual([IMAGE]);
      // No component: a template that isn't active, or the admin zone.
      expect(renderToStaticMarkup(<BlockList blocks={blocks} context={context} />)).toBe("");
      expect(
        renderToStaticMarkup(<BlockList blocks={blocks} context={{ ...context, editing: true }} />),
      ).toContain("drawn by the Studio template");
    } finally {
      registerTemplateBlocks([]);
    }
  });
});

describe("the canvas's messages", () => {
  const key = (
    k: string,
    mods: Partial<Record<"ctrl" | "meta" | "shift" | "alt", boolean>> = {},
  ) => ({
    key: k,
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
  });

  test("hands the editor its own shortcuts and nothing else", () => {
    expect(isEditorKey(key("s", { ctrl: true }))).toBe(true);
    expect(isEditorKey(key("Z", { meta: true, shift: true }))).toBe(true);
    expect(isEditorKey(key("k", { ctrl: true }))).toBe(true);
    expect(isEditorKey(key("ArrowUp", { alt: true }))).toBe(true);
    expect(isEditorKey(key("Delete"))).toBe(true);
    expect(isEditorKey(key("a", { ctrl: true }))).toBe(false);
    expect(isEditorKey(key("ArrowUp"))).toBe(false);
    expect(isEditorKey(key("Delete", { ctrl: true }))).toBe(false);
    expect(isEditorKey(key("s", { ctrl: true, alt: true }))).toBe(false);
  });

  test("tags every message, so other messages a page gets are told apart", () => {
    expect(canvasMessage({ type: "ready" })).toEqual({
      type: "ready",
      source: "sitebuilder-canvas",
    });
  });
});
