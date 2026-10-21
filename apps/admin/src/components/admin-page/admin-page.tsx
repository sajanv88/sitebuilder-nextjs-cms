import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@nuvui/react";
import type { Route } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import "./admin-page.scss";

// One admin screen, after nuvui's page-header block: a breadcrumb, the title with its status,
// a line on what the screen is for, the screen's actions at the far end, and a row of facts
// under them. The content follows, at the width the screen needs.

export interface Crumb {
  label: string;
  href: Route;
}

export interface Fact {
  label: string;
  value: ReactNode;
}

export function AdminPage({
  title,
  description,
  trail = [],
  badge,
  actions,
  facts,
  width = "default",
  children,
}: {
  title: string;
  description?: ReactNode;
  // The pages above this one, after Dashboard.
  trail?: readonly Crumb[];
  badge?: ReactNode;
  actions?: ReactNode;
  facts?: readonly Fact[];
  // "wide" for screens that are panes side by side (Media, Menus), "narrow" for a single form.
  width?: "narrow" | "default" | "wide";
  children: ReactNode;
}) {
  const crumbs: Crumb[] = title === "Dashboard" ? [] : [{ label: "Dashboard", href: "/admin" }];
  crumbs.push(...trail);
  return (
    <div className={`admin-page admin-page--${width}`}>
      <header className="admin-page__header">
        <div className="admin-page__inner">
          {crumbs.length > 0 ? (
            <Breadcrumb>
              <BreadcrumbList>
                {crumbs.map((crumb) => (
                  <Fragment key={crumb.href}>
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link href={crumb.href}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                  </Fragment>
                ))}
                <BreadcrumbItem>
                  <BreadcrumbPage>{title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          ) : null}
          <div className="admin-page__row">
            <div className="admin-page__about">
              <div className="admin-page__heading">
                <h1 id="admin-page-title" className="admin-page__title">
                  {title}
                </h1>
                {badge}
              </div>
              {description ? <p className="admin-page__description">{description}</p> : null}
            </div>
            {actions ? <div className="admin-page__actions">{actions}</div> : null}
          </div>
          {facts && facts.length > 0 ? (
            <dl className="admin-page__facts">
              {facts.map((fact) => (
                <div key={fact.label} className="admin-page__fact">
                  <dt className="admin-page__label">{fact.label}</dt>
                  <dd className="admin-page__value">{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </header>
      <section className="admin-page__body" aria-labelledby="admin-page-title">
        {children}
      </section>
    </div>
  );
}
