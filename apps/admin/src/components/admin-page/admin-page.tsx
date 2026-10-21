import type { ReactNode } from "react";
import "./admin-page.scss";

// One admin screen: its title with the screen's main actions beside it, then its content.
export function AdminPage({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="admin-page" aria-labelledby="admin-page-title">
      <div className="admin-page__head">
        <h1 id="admin-page-title" className="admin-page__title">
          {title}
        </h1>
        {actions ? <div className="admin-page__actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
