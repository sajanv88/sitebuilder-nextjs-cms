import type { Metadata } from "next";
import { requireViewer } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";

export const metadata: Metadata = { title: "Dashboard" };

// Placeholder until there's content to summarise (phase 2).
export default async function DashboardPage() {
  const viewer = await requireViewer();
  return (
    <AdminPage title="Dashboard">
      <p className="admin-page__text">Welcome, {viewer.name}.</p>
    </AdminPage>
  );
}
