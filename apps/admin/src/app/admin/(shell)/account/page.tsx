// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { Metadata } from "next";
import { requireViewer } from "@/auth/session";
import { AccountForms } from "@/components/account-forms/account-forms";
import { AdminPage } from "@/components/admin-page/admin-page";

export const metadata: Metadata = { title: "My account" };

// Everyone who can sign in may change their own name and password: no permission (§6.1).
export default async function AccountPage() {
  const viewer = await requireViewer();
  return (
    <AdminPage
      title="My account"
      description="Your name as others see it, and the password you sign in with."
      width="narrow"
      facts={[
        { label: "Email", value: viewer.email },
        { label: "Role", value: viewer.role[0]?.toUpperCase() + viewer.role.slice(1) },
      ]}
    >
      <AccountForms name={viewer.name} email={viewer.email} />
    </AdminPage>
  );
}
