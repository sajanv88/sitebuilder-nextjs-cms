import { countUsers, db } from "@sitebuilder/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AuthScreen } from "@/components/auth-screen/auth-screen";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up your site" };

// Reachable only while the user table is empty (design §8.1). After that it's a 404, and the
// action refuses too.
export default async function SetupPage() {
  // Rendered per request, never at build: whether it's open depends on the database now.
  await connection();
  if ((await countUsers(db)) > 0) notFound();

  return (
    <AuthScreen
      title="Set up your site"
      intro="Create the first admin account. You can add more people once you're signed in."
    >
      <SetupForm />
    </AuthScreen>
  );
}
