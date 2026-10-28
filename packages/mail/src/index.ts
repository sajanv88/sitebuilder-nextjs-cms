// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import "server-only";

// Email through SMTP (decisions #147): which server, its password sealed in the settings, the
// connection, and the messages the site sends: a password reset link and an invitation.

export { type MailConfig, type MailSetup, type MailSources, mailConfig } from "./config";
export { inviteMessage, type Message, resetMessage } from "./messages";
export { openPassword, sealPassword } from "./password";
export { type SendResult, sendMail, verifyMail } from "./send";
