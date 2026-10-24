// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classifyAddress, guardedFetch } from "./outbound";
import { OutboundError } from "./outbound-error";

describe("classifyAddress", () => {
  it.each([
    ["8.8.8.8", "public"],
    ["1.1.1.1", "public"],
    ["2606:4700:4700::1111", "public"],
    ["127.0.0.1", "private"],
    ["127.255.0.9", "private"],
    ["10.1.2.3", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["172.32.0.1", "public"],
    ["192.168.1.10", "private"],
    ["100.64.0.1", "private"],
    ["::1", "private"],
    ["fd12:3456::1", "private"],
    ["fc00::1", "private"],
    ["169.254.169.254", "blocked"],
    ["169.254.0.1", "blocked"],
    ["100.100.100.200", "blocked"],
    ["0.0.0.0", "blocked"],
    ["::", "blocked"],
    ["fe80::1", "blocked"],
    ["fe80::1%eth0", "blocked"],
    ["fd00:ec2::254", "blocked"],
    ["224.0.0.1", "blocked"],
    ["255.255.255.255", "blocked"],
    ["ff02::1", "blocked"],
    // IPv4 inside IPv6 is judged as the IPv4 address.
    ["::ffff:127.0.0.1", "private"],
    ["::ffff:7f00:1", "private"],
    ["::ffff:169.254.169.254", "blocked"],
    ["::ffff:a9fe:a9fe", "blocked"],
    ["::ffff:8.8.8.8", "public"],
    ["64:ff9b::a9fe:a9fe", "blocked"],
    ["64:ff9b::10.0.0.1", "private"],
    ["2002:a9fe:a9fe::1", "blocked"],
    ["2002:0a00:0001::", "private"],
    ["::10.0.0.1", "private"],
    // Not addresses.
    ["localhost", "blocked"],
    ["not-an-ip", "blocked"],
    ["1:2:3:4:5:6:7:8:9", "blocked"],
  ])("%s is %s", (address, kind) => {
    expect(classifyAddress(address)).toBe(kind);
  });
});

const refused = async (promise: Promise<unknown>, code = "blocked_url") => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(OutboundError);
  expect((error as OutboundError).code).toBe(code);
};

describe("guardedFetch: what it refuses before connecting", () => {
  const strict = guardedFetch({ allowPrivate: false });
  const open = guardedFetch({ allowPrivate: true });

  it("refuses plain http to the internet, even with private addresses allowed", async () => {
    await refused(strict("http://8.8.8.8/"));
    await refused(open("http://8.8.8.8/"));
  });

  it("refuses private and loopback addresses unless allowed", async () => {
    await refused(strict("https://127.0.0.1/"));
    await refused(strict("https://10.0.0.5/"));
    await refused(strict("https://[::1]/"));
    await refused(strict("https://[::ffff:127.0.0.1]/"));
  });

  it("refuses a name that resolves to a private address", async () => {
    await refused(strict("https://localhost:11434/api/tags"));
  });

  it("refuses metadata addresses, whatever the setting", async () => {
    await refused(open("http://169.254.169.254/latest/meta-data/"));
    await refused(open("http://[fd00:ec2::254]/"));
    await refused(open("http://[::ffff:169.254.169.254]/"));
  });

  it("refuses other schemes and user names in the address", async () => {
    await refused(open("file:///etc/passwd"));
    await refused(open("ftp://example.com/"));
    await refused(open("https://user:pass@example.com/"));
    await refused(open("not a url"));
  });
});

describe("guardedFetch: a round trip to a server on this machine", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === "/redirect") {
        response.writeHead(302, { location: "http://169.254.169.254/" }).end();
      } else if (request.url === "/large") {
        response.writeHead(200, { "content-type": "text/plain" }).end("x".repeat(2048));
      } else if (request.url === "/slow") {
        setTimeout(() => response.end("late"), 500);
      } else {
        let body = "";
        request.on("data", (chunk) => {
          body += chunk;
        });
        request.on("end", () => {
          response
            .writeHead(201, { "content-type": "application/json", "x-test": "yes" })
            .end(
              JSON.stringify({ method: request.method, body, auth: request.headers.authorization }),
            );
        });
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("sends the method, headers and body, and returns the answer", async () => {
    const fetch = guardedFetch({ allowPrivate: true });
    const response = await fetch(`${base}/echo`, {
      method: "POST",
      headers: { authorization: "Bearer test-key" },
      body: "hello",
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-test")).toBe("yes");
    expect(await response.json()).toEqual({
      method: "POST",
      body: "hello",
      auth: "Bearer test-key",
    });
  });

  it("reaches localhost by name when private addresses are allowed", async () => {
    const fetch = guardedFetch({ allowPrivate: true });
    const port = new URL(base).port;
    const response = await fetch(`http://localhost:${port}/echo`);
    expect(response.status).toBe(201);
  });

  it("refuses the same server when private addresses aren't allowed", async () => {
    await refused(guardedFetch({ allowPrivate: false })(`${base}/echo`));
  });

  it("refuses a redirect", async () => {
    await refused(guardedFetch({ allowPrivate: true })(`${base}/redirect`));
  });

  it("refuses an answer over the size cap", async () => {
    await refused(
      guardedFetch({ allowPrivate: true, maxBytes: 1024 })(`${base}/large`),
      "invalid_output",
    );
  });

  it("gives up after the timeout", async () => {
    await refused(guardedFetch({ allowPrivate: true, timeoutMs: 100 })(`${base}/slow`), "timeout");
  });

  it("stops when the caller aborts", async () => {
    const controller = new AbortController();
    const pending = guardedFetch({ allowPrivate: true })(`${base}/slow`, {
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});
