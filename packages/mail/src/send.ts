// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import nodemailer, { type Transporter } from "nodemailer";
import type { MailConfig } from "./config";
import type { Message } from "./messages";

// The connection to the SMTP server, through nodemailer. Short timeouts: a person is waiting
// on the screen that sends. Errors come back as a sentence an admin can act on, never with the
// server's own words, which may hold the user name.

export type SendResult = { ok: true } | { ok: false; message: string };

function transport(config: MailConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // TLS from the start, or STARTTLS that must succeed; "none" sends as it is.
    secure: config.security === "tls",
    requireTLS: config.security === "starttls",
    ignoreTLS: config.security === "none",
    ...(config.username ? { auth: { user: config.username, pass: config.password ?? "" } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

// nodemailer's error codes, in words.
function problem(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  switch (code) {
    case "EAUTH":
      return "The server refused the user name or password.";
    case "ETIMEDOUT":
    case "ECONNECTION":
    case "ECONNREFUSED":
    case "ESOCKET":
      return "The server couldn't be reached. Check its name, port and security.";
    case "ETLS":
      return "The secure connection failed. Check the security setting for this port.";
    case "EENVELOPE":
      return "The server refused the sender or the recipient address.";
    default:
      return "The server refused the email.";
  }
}

// Connects and signs in, sending nothing: for Settings, before a server is saved.
export async function verifyMail(config: MailConfig): Promise<SendResult> {
  const sender = transport(config);
  try {
    await sender.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: problem(error) };
  } finally {
    sender.close();
  }
}

export async function sendMail(
  config: MailConfig,
  to: string,
  message: Message,
  // Tests pass their own; nodemailer's SMTP otherwise.
  sender: Pick<Transporter, "sendMail" | "close"> = transport(config),
): Promise<SendResult> {
  try {
    await sender.sendMail({
      from: config.from.name
        ? { name: config.from.name, address: config.from.address }
        : config.from.address,
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: problem(error) };
  } finally {
    sender.close();
  }
}
