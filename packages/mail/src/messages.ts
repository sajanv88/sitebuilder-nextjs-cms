// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

// The emails the site sends, as plain text and simple HTML. Every value from the database is
// escaped for the HTML: a site title or a person's name is text, never markup.

export interface Message {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// One short paragraph per line, a button for the link, and the link written out under it for a
// client that shows no buttons.
function html(paragraphs: readonly string[], link: { label: string; url: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join("");
  const url = escapeHtml(link.url);
  return `<!doctype html><html><body style="margin:0;padding:24px;font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#111827"><div style="max-width:32rem">${body}<p style="margin:24px 0"><a href="${url}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#2563eb;color:#ffffff;text-decoration:none">${escapeHtml(link.label)}</a></p><p style="margin:0;font-size:14px;color:#4b5563">${url}</p></div></body></html>`;
}

// How long a link lasts, in words, from Better Auth's token lifetime.
const lasting = (hours: number) => (hours === 1 ? "an hour" : `${hours} hours`);

export function resetMessage(input: {
  siteTitle: string;
  name: string;
  url: string;
  hours: number;
}): Message {
  const lines = [
    `Hello ${input.name},`,
    `Someone asked to reset the password of your account on ${input.siteTitle}. Choose a new one with the link below; it works once, for ${lasting(input.hours)}.`,
    "If it wasn't you, ignore this email: your password stays as it is.",
  ];
  return {
    subject: `Reset your password for ${input.siteTitle}`,
    text: `${lines.join("\n\n")}\n\n${input.url}\n`,
    html: html(lines, { label: "Choose a new password", url: input.url }),
  };
}

export function inviteMessage(input: {
  siteTitle: string;
  name: string;
  url: string;
  hours: number;
}): Message {
  const lines = [
    `Hello ${input.name},`,
    `You have an account on ${input.siteTitle}. Choose your password with the link below to sign in; it works once, for ${lasting(input.hours)}.`,
    "If you weren't expecting this, ignore this email.",
  ];
  return {
    subject: `Your account on ${input.siteTitle}`,
    text: `${lines.join("\n\n")}\n\n${input.url}\n`,
    html: html(lines, { label: "Choose your password", url: input.url }),
  };
}
