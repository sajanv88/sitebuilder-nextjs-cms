import type { ReactNode } from "react";
import "./admin-page.scss";

// One admin screen: its title, then its content.
export function AdminPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-page" aria-labelledby="admin-page-title">
      <h1 id="admin-page-title" className="admin-page__title">
        {title}
      </h1>
      {children}
    </section>
  );
}
