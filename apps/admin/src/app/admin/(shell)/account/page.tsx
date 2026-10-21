import type { Metadata } from "next";
import { requireViewer } from "@/auth/session";
import { AccountForms } from "@/components/account-forms/account-forms";
import { AdminPage } from "@/components/admin-page/admin-page";

export const metadata: Metadata = { title: "My account" };

// Everyone who can sign in may change their own name and password: no permission (§6.1).
export default async function AccountPage() {
  const viewer = await requireViewer();
  return (
    <AdminPage title="My account">
      <AccountForms name={viewer.name} email={viewer.email} />
    </AdminPage>
  );
}
