import { expectTypeOf, test } from "vitest";
import type { Block, BlockList } from "./blocks";
import type { Env } from "./env";
import type { MenuItem } from "./menu";
import type { SettingsValue, ThemeSettings } from "./settings";

test("a block list is a list of blocks", () => {
  expectTypeOf<BlockList>().toEqualTypeOf<Block[]>();
});

test("menu items are discriminated by kind", () => {
  expectTypeOf<Extract<MenuItem, { kind: "group" }>>().not.toHaveProperty("url");
  expectTypeOf<Extract<MenuItem, { kind: "url" }>["url"]>().toEqualTypeOf<string>();
});

test("S3 variables exist only when MEDIA_STORAGE is s3", () => {
  expectTypeOf<Extract<Env, { MEDIA_STORAGE: "s3" }>>().toHaveProperty("S3_BUCKET");
  expectTypeOf<Extract<Env, { MEDIA_STORAGE: "local" }>>().not.toHaveProperty("S3_BUCKET");
  expectTypeOf<Env["MEDIA_MAX_BYTES"]>().toEqualTypeOf<number>();
});

test("settings values are keyed", () => {
  expectTypeOf<SettingsValue<"theme">>().toEqualTypeOf<ThemeSettings>();
});
