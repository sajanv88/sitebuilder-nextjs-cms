import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../testing/pglite";
import { bootstrapSite } from "./bootstrap";
import { getSettings } from "./settings";
import { countUsers } from "./users";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const admin = {
  name: "Ada",
  email: "ada@example.com",
  passwordHash: "salt:hash",
  siteUrl: "https://example.com",
  allowExistingUsers: false,
};

describe("bootstrapSite", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("creates the admin, a credential account, the settings and both menus", async () => {
    const result = await bootstrapSite(db, admin);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const created = await db.query.user.findFirst({
      where: { id: result.userId },
      with: { accounts: true },
    });
    expect(created).toMatchObject({ email: "ada@example.com", role: "admin", emailVerified: true });
    expect(created?.accounts).toEqual([
      expect.objectContaining({
        providerId: "credential",
        accountId: result.userId,
        password: "salt:hash",
      }),
    ]);

    expect(await getSettings(db, "site")).toEqual({
      title: "My Site",
      tagline: "",
      language: "en",
      siteUrl: "https://example.com",
      dateFormat: "dd/MM/yyyy",
      timeZone: "Europe/London",
    });
    expect(await getSettings(db, "reading")).toMatchObject({
      postsPath: "/blog",
      homepageEntryId: null,
    });
    const menus = await db.query.menus.findMany({ orderBy: { location: "asc" } });
    expect(menus).toEqual([
      { location: "footer", items: [] },
      { location: "primary", items: [] },
    ]);
  });

  it("refuses once a user exists", async () => {
    await bootstrapSite(db, admin);
    expect(await bootstrapSite(db, { ...admin, email: "eve@example.com" })).toEqual({
      ok: false,
      error: "already-set-up",
    });
    expect(await countUsers(db)).toBe(1);
  });

  it("with allowExistingUsers adds another admin and keeps existing settings", async () => {
    await bootstrapSite(db, admin);
    const second = await bootstrapSite(db, {
      ...admin,
      email: "grace@example.com",
      siteUrl: "https://other.example",
      allowExistingUsers: true,
    });
    expect(second.ok).toBe(true);
    expect(await countUsers(db)).toBe(2);
    expect((await getSettings(db, "site"))?.siteUrl).toBe("https://example.com");
  });

  it("reports a taken email and writes nothing", async () => {
    await bootstrapSite(db, admin);
    expect(await bootstrapSite(db, { ...admin, allowExistingUsers: true })).toEqual({
      ok: false,
      error: "email-taken",
    });
    expect(await countUsers(db)).toBe(1);
  });
});
