import { can } from "@sitebuilder/auth";
import { db, listTerms } from "@sitebuilder/db";
import type { TaxonomyKind } from "@sitebuilder/schema";
import { requirePermission } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";
import { TermManager } from "@/components/term-manager/term-manager";

// The Categories and Tags screens. Authors may assign terms to their posts but not manage them,
// so they don't get these screens at all (§6.2).
export async function TermScreen({ taxonomy }: { taxonomy: TaxonomyKind }) {
  const viewer = await requirePermission("term.update");
  const terms = await listTerms(db, taxonomy);
  return (
    <AdminPage
      title={taxonomy === "category" ? "Categories" : "Tags"}
      trail={[{ label: "Posts", href: "/admin/posts" }]}
      description={
        taxonomy === "category"
          ? "The few broad subjects posts are filed under. Each has its own page on the site, listing its posts."
          : "Finer labels for posts, as many as help. Each has its own page on the site, listing its posts."
      }
      facts={[{ label: taxonomy === "category" ? "Categories" : "Tags", value: terms.length }]}
    >
      <TermManager
        taxonomy={taxonomy}
        terms={terms}
        allowed={{
          create: can(viewer, "term.create"),
          update: can(viewer, "term.update"),
          delete: can(viewer, "term.delete"),
        }}
      />
    </AdminPage>
  );
}
