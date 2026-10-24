// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { lookup as dnsLookup } from "node:dns";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { OutboundError } from "./outbound-error";
import type { FetchLike } from "./types";

// The outbound guard (templates_and_ai_design B4; nextjs-security rule 10). Every request to an
// AI provider goes through it, because an admin types the Ollama address and the server then
// sends a key there. It:
// - resolves the host and checks every address it gets: link-local and cloud metadata
//   addresses are always refused; loopback and private networks only when the server allows
//   them (AI_ALLOW_PRIVATE_URLS=true, for Ollama on the same machine or network);
// - connects to the address it checked (the check is the socket's own lookup), so a name that
//   resolves differently a second time can't slip past;
// - wants https on the internet: plain http only to an allowed private address;
// - refuses redirects, user names in the address, and answers larger than maxBytes;
// - gives up after timeoutMs.

export type AddressKind = "public" | "private" | "blocked";

export interface OutboundOptions {
  allowPrivate: boolean;
  timeoutMs?: number;
  maxBytes?: number;
}

type Range = readonly [bytes: readonly number[], bits: number];

const v4 = (text: string, bits: number): Range => [text.split(".").map(Number), bits];

// Never reachable, whatever the setting: "this network", link-local (cloud metadata lives at
// 169.254.169.254), Alibaba's metadata address, multicast, reserved, broadcast.
const BLOCKED_V4: Range[] = [
  v4("0.0.0.0", 8),
  v4("169.254.0.0", 16),
  v4("100.100.100.200", 32),
  v4("192.0.0.0", 24),
  v4("224.0.0.0", 4),
  v4("240.0.0.0", 4),
];
// Loopback, private networks, carrier-grade NAT, benchmarking.
const PRIVATE_V4: Range[] = [
  v4("127.0.0.0", 8),
  v4("10.0.0.0", 8),
  v4("172.16.0.0", 12),
  v4("192.168.0.0", 16),
  v4("100.64.0.0", 10),
  v4("198.18.0.0", 15),
];

const v6 = (text: string, bits: number): Range => [v6Bytes(text) ?? [], bits];

// Unspecified, link-local, multicast, AWS's IPv6 metadata address, documentation.
const BLOCKED_V6: Range[] = [
  v6("::", 128),
  v6("fe80::", 10),
  v6("ff00::", 8),
  v6("fd00:ec2::254", 128),
  v6("2001:db8::", 32),
];
// Loopback, unique-local, old site-local, Teredo tunnels.
const PRIVATE_V6: Range[] = [v6("::1", 128), v6("fc00::", 7), v6("fec0::", 10), v6("2001::", 32)];

function inRange(bytes: readonly number[], [base, bits]: Range): boolean {
  for (let i = 0; i < base.length && bits > 0; i++, bits -= 8) {
    const mask = bits >= 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
    if (((bytes[i] ?? 0) & mask) !== ((base[i] ?? 0) & mask)) return false;
  }
  return true;
}

function v6Bytes(address: string): number[] | null {
  let text = address.replace(/%.*$/, "").toLowerCase();
  // A trailing dotted IPv4 address, ::ffff:10.0.0.1, is the last two words.
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number) as [number, number, number, number];
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const words = (part: string | undefined) => (part ? part.split(":") : []);
  const head = words(halves[0]);
  const rest = words(halves[1]);
  const middle = halves.length === 2 ? 8 - head.length - rest.length : 0;
  const all = [...head, ...Array<string>(Math.max(middle, 0)).fill("0"), ...rest];
  if (middle < 0 || all.length !== 8 || !all.every((w) => /^[0-9a-f]{1,4}$/.test(w))) return null;
  return all.flatMap((word) => {
    const value = Number.parseInt(word, 16);
    return [(value >> 8) & 0xff, value & 0xff];
  });
}

function classifyV4(bytes: readonly number[]): AddressKind {
  if (BLOCKED_V4.some((range) => inRange(bytes, range))) return "blocked";
  if (PRIVATE_V4.some((range) => inRange(bytes, range))) return "private";
  return "public";
}

// Which kind of address this is. Anything that isn't an IP address is blocked.
export function classifyAddress(address: string): AddressKind {
  const version = isIP(address.replace(/%.*$/, ""));
  if (version === 4) return classifyV4(address.split(".").map(Number));
  if (version !== 6) return "blocked";
  const bytes = v6Bytes(address);
  if (!bytes) return "blocked";
  const zeros = (from: number, to: number) => bytes.slice(from, to).every((b) => b === 0);
  // IPv4 inside IPv6 is judged as the IPv4 address: mapped (::ffff:a.b.c.d), NAT64
  // (64:ff9b::a.b.c.d), 6to4 (2002:aabb:ccdd::), and the old compatible form (::a.b.c.d).
  if (zeros(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return classifyV4(bytes.slice(12));
  if (inRange(bytes, v6("64:ff9b::", 96))) return classifyV4(bytes.slice(12));
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return classifyV4(bytes.slice(2, 6));
  if (zeros(0, 12) && !zeros(12, 15)) return classifyV4(bytes.slice(12));
  if (BLOCKED_V6.some((range) => inRange(bytes, range))) return "blocked";
  if (PRIVATE_V6.some((range) => inRange(bytes, range))) return "private";
  return "public";
}

// Whether a request over this protocol may go to this address.
function allowed(kind: AddressKind, protocol: string, allowPrivate: boolean): boolean {
  if (kind === "public") return protocol === "https:";
  return kind === "private" && allowPrivate;
}

function refusal(address: string, protocol: string): OutboundError {
  const kind = classifyAddress(address);
  const why =
    kind === "blocked"
      ? "a link-local or reserved address"
      : kind === "private"
        ? "an address on this machine or a private network, and AI_ALLOW_PRIVATE_URLS isn't true"
        : `the internet over ${protocol.replace(":", "")}; use https`;
  return new OutboundError("blocked_url", `Refused: ${why}.`);
}

function toHeaders(incoming: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) for (const one of value) headers.append(name, one);
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

export function guardedFetch({
  allowPrivate,
  timeoutMs = 90_000,
  maxBytes = 4 * 1024 * 1024,
}: OutboundOptions): FetchLike {
  return (input, init = {}) =>
    new Promise<Response>((resolve, reject) => {
      const url = URL.parse(input);
      if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
        reject(new OutboundError("blocked_url", "Refused: not an http or https address."));
        return;
      }
      if (url.username || url.password) {
        reject(new OutboundError("blocked_url", "Refused: a user name in the address."));
        return;
      }
      const host = url.hostname.replace(/^\[|\]$/g, "");
      // An address written as an IP isn't looked up, so it's checked here.
      if (isIP(host) && !allowed(classifyAddress(host), url.protocol, allowPrivate)) {
        reject(refusal(host, url.protocol));
        return;
      }

      const lookup: LookupFunction = (hostname, options, callback) => {
        dnsLookup(hostname, { family: options.family ?? 0, all: true }, (error, addresses) => {
          if (error) {
            callback(error, "", 4);
            return;
          }
          const bad = addresses.find(
            (a) => !allowed(classifyAddress(a.address), url.protocol, allowPrivate),
          );
          const first = addresses[0];
          if (bad || !first) {
            callback(refusal(bad?.address ?? "", url.protocol), "", 4);
            return;
          }
          if (options.all) callback(null, addresses);
          else callback(null, first.address, first.family);
        });
      };

      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = init.signal ? AbortSignal.any([timeout, init.signal]) : timeout;
      const send = url.protocol === "https:" ? httpsRequest : httpRequest;
      const request = send(
        url,
        { method: init.method ?? "GET", headers: init.headers, lookup, signal },
        (response) => {
          const status = response.statusCode ?? 0;
          // A promise settles once, so whatever happens after the refusal is ignored.
          if (status >= 300 && status < 400) {
            reject(new OutboundError("blocked_url", "Refused: the answer was a redirect."));
            request.destroy();
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) {
              reject(
                new OutboundError(
                  "invalid_output",
                  `The answer was larger than ${maxBytes} bytes.`,
                ),
              );
              request.destroy();
            } else chunks.push(chunk);
          });
          response.on("end", () => {
            if (size > maxBytes) return;
            const empty = status === 204 || status === 304;
            resolve(
              new Response(empty ? null : Buffer.concat(chunks), {
                status,
                headers: toHeaders(response.headers),
              }),
            );
          });
          response.on("error", (error) => reject(describe(error)));
        },
      );
      const describe = (error: Error): Error => {
        if (error instanceof OutboundError) return error;
        if (init.signal?.aborted) return error;
        if (timeout.aborted) {
          return new OutboundError("timeout", `No answer within ${timeoutMs / 1000} seconds.`);
        }
        return new OutboundError("unavailable", error.message);
      };
      request.on("error", (error) => reject(describe(error)));
      if (init.body !== undefined) request.write(init.body);
      request.end();
    });
}
