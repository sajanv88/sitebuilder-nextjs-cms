import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTION_EFFECTS } from "./action-effects";

const actionsDir = join(import.meta.dirname, "..", "actions");

function sourceOf(file: string): string {
  return readFileSync(join(actionsDir, file), "utf8");
}

// Each exported function's body, roughly: from its declaration to the next one.
function exportedActions(source: string): { name: string; body: string }[] {
  const starts = [...source.matchAll(/^export async function (\w+)/gm)];
  return starts.map((match, i) => ({
    name: match[1] ?? "",
    body: source.slice(match.index, starts[i + 1]?.index ?? source.length),
  }));
}

const files = readdirSync(actionsDir).filter((file) => file.endsWith(".ts"));

describe("public cache invalidation", () => {
  it("lists every Server Action", () => {
    const names = files.flatMap((file) => exportedActions(sourceOf(file)).map((a) => a.name));
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => !(name in ACTION_EFFECTS))).toEqual([]);
  });

  // An action passes its own name to invalidate(), directly or through a helper of its file.
  it("has every action that changes the public site invalidate it, under its own name", () => {
    const missing = files.flatMap((file) =>
      exportedActions(sourceOf(file))
        .filter(
          ({ name }) => (ACTION_EFFECTS[name as keyof typeof ACTION_EFFECTS] ?? []).length > 0,
        )
        .filter(
          ({ name, body }) =>
            !sourceOf(file).includes("invalidate(") || !body.includes(`"${name}"`),
        )
        .map(({ name }) => name),
    );
    expect(missing).toEqual([]);
  });
});
