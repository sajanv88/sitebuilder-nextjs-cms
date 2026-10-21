import { describe, expect, test } from "vitest";
import { openSecret, sealSecret } from "./secrets";

const authSecret = "a".repeat(32);

describe("sealSecret and openSecret", () => {
  test("round-trip, with a fresh iv each time", () => {
    const first = sealSecret("wJalrXUtnFEMI/K7MDENG", authSecret);
    const second = sealSecret("wJalrXUtnFEMI/K7MDENG", authSecret);
    expect(first.data).not.toContain("wJalr");
    expect(first.iv).not.toBe(second.iv);
    expect(openSecret(first, authSecret)).toBe("wJalrXUtnFEMI/K7MDENG");
  });

  test("another AUTH_SECRET or a changed value can't be opened", () => {
    const sealed = sealSecret("secret", authSecret);
    expect(openSecret(sealed, "b".repeat(32))).toBeNull();
    const flipped = sealed.data.startsWith("A")
      ? `B${sealed.data.slice(1)}`
      : `A${sealed.data.slice(1)}`;
    expect(openSecret({ ...sealed, data: flipped }, authSecret)).toBeNull();
  });
});
