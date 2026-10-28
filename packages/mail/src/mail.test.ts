// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { parseFrom } from "@sitebuilder/schema";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mailConfig, inviteMessage, openPassword, resetMessage, sealPassword, sendMail } =
  await import("./index");

const SECRET = "a-test-secret-that-is-at-least-32-characters";
const OTHER = "another-test-secret-at-least-32-characters!!";

describe("where email goes out", () => {
  const saved = {
    host: "smtp.example.com",
    port: 465,
    security: "tls" as const,
    username: "site@example.com",
    password: sealPassword("s3cret", SECRET),
    fromName: "My Site",
    fromAddress: "site@example.com",
  };

  it("uses the saved server first, its password opened", () => {
    const setup = mailConfig({
      settings: saved,
      env: { SMTP_HOST: "ignored.example.com" },
      authSecret: SECRET,
    });
    expect(setup).toMatchObject({
      ok: true,
      from: "settings",
      config: { host: "smtp.example.com", password: "s3cret", from: { name: "My Site" } },
    });
  });

  it("says so when the password can't be opened any more", () => {
    expect(mailConfig({ settings: saved, env: {}, authSecret: OTHER })).toEqual({
      ok: false,
      reason: "secret-unreadable",
    });
  });

  it("falls back to the environment, with the usual security for the port", () => {
    const setup = mailConfig({
      settings: null,
      env: { SMTP_HOST: "relay.local", SMTP_PORT: 587, SMTP_FROM: "Site <site@example.com>" },
      authSecret: SECRET,
    });
    expect(setup).toMatchObject({
      ok: true,
      from: "environment",
      config: { host: "relay.local", port: 587, security: "starttls", username: null },
    });
    expect(
      mailConfig({ settings: null, env: { SMTP_HOST: "relay.local" }, authSecret: SECRET }),
    ).toEqual({ ok: false, reason: "not-configured" });
    expect(mailConfig({ settings: null, env: {}, authSecret: SECRET }).ok).toBe(false);
  });
});

describe("the sealed password", () => {
  it("opens only with the same secret, and only for this row", () => {
    const sealed = sealPassword("pässword", SECRET);
    expect(openPassword(sealed, SECRET)).toBe("pässword");
    expect(openPassword(sealed, OTHER)).toBeNull();
    expect(openPassword({ ...sealed, data: sealed.data.slice(1) }, SECRET)).toBeNull();
  });
});

describe("the messages", () => {
  it("escape what comes from the database, and carry the link in both forms", () => {
    const message = resetMessage({
      siteTitle: "<b>Bakery</b>",
      name: 'Ada "A" Lovelace',
      url: "https://example.com/api/auth/reset-password/abc?callbackURL=%2Fadmin",
      hours: 24,
    });
    expect(message.subject).toBe("Reset your password for <b>Bakery</b>");
    expect(message.html).toContain("&lt;b&gt;Bakery&lt;/b&gt;");
    expect(message.html).not.toContain("<b>Bakery");
    expect(message.html).toContain("Ada &quot;A&quot; Lovelace");
    expect(message.text).toContain("https://example.com/api/auth/reset-password/abc");
    expect(message.text).toContain("24 hours");
    expect(
      inviteMessage({ siteTitle: "Bakery", name: "Ada", url: "https://x", hours: 1 }).text,
    ).toContain("for an hour");
  });

  it("parse SMTP_FROM with or without a name", () => {
    expect(parseFrom("Bakery <hello@example.com>")).toEqual({
      name: "Bakery",
      address: "hello@example.com",
    });
    expect(parseFrom("HELLO@example.com")).toEqual({ name: "", address: "hello@example.com" });
    expect(parseFrom("not an address")).toBeNull();
  });
});

describe("sending", () => {
  const config = {
    host: "smtp.example.com",
    port: 587,
    security: "starttls" as const,
    username: null,
    password: null,
    from: { name: "Bakery", address: "hello@example.com" },
  };

  it("sends from the site, to the one address, and closes the connection", async () => {
    const sent: unknown[] = [];
    const sender = { sendMail: vi.fn(async (mail: unknown) => sent.push(mail)), close: vi.fn() };
    const message = inviteMessage({
      siteTitle: "Bakery",
      name: "Ada",
      url: "https://x",
      hours: 24,
    });
    expect(await sendMail(config, "ada@example.com", message, sender as never)).toEqual({
      ok: true,
    });
    expect(sent[0]).toMatchObject({
      from: { name: "Bakery", address: "hello@example.com" },
      to: "ada@example.com",
      subject: "Your account on Bakery",
    });
    expect(sender.close).toHaveBeenCalled();
  });

  it("says what went wrong in words, never the server's own", async () => {
    const sender = {
      sendMail: vi.fn(async () => {
        throw Object.assign(new Error("535 user ada@example.com bad password"), { code: "EAUTH" });
      }),
      close: vi.fn(),
    };
    const result = await sendMail(
      config,
      "ada@example.com",
      resetMessage({ siteTitle: "B", name: "A", url: "https://x", hours: 1 }),
      sender as never,
    );
    expect(result).toEqual({ ok: false, message: "The server refused the user name or password." });
  });
});
