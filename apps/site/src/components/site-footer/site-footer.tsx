// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import type { ResolvedMenuItem } from "@sitebuilder/db";
import "./site-footer.scss";

// The foot of every page, after nuvui's footer block: the site's name and tagline, and the
// footer menu. Its plain links are one list; each group is a list of its own under its label.
// No copyright year: design §7 says not to render today's date on the server.

const newTab = (item: ResolvedMenuItem) =>
  item.openInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {};

function FooterLink({ item }: { item: ResolvedMenuItem }) {
  return (
    <li>
      <a className="site-footer__link" href={item.href ?? undefined} {...newTab(item)}>
        {item.label}
      </a>
    </li>
  );
}

export function SiteFooter({
  title,
  tagline,
  items,
}: {
  title: string;
  tagline: string;
  items: ResolvedMenuItem[];
}) {
  const links = items.filter((item) => item.children.length === 0);
  const groups = items.filter((item) => item.children.length > 0);
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__top">
          <div className="site-footer__about">
            <a className="site-footer__brand" href="/">
              {title}
            </a>
            {tagline ? <p className="site-footer__text">{tagline}</p> : null}
          </div>
          {links.length > 0 ? (
            <nav className="site-footer__group" aria-label="Footer">
              <ul className="site-footer__list">
                {links.map((item) => (
                  <FooterLink key={item.id} item={item} />
                ))}
              </ul>
            </nav>
          ) : null}
          {groups.map((group) => (
            // Each list is a landmark of its own, named by its heading.
            <nav
              key={group.id}
              className="site-footer__group"
              aria-labelledby={`footer-${group.id}`}
            >
              <h2 className="site-footer__heading" id={`footer-${group.id}`}>
                {group.label}
              </h2>
              <ul className="site-footer__list">
                {(group.href
                  ? [{ ...group, children: [] }, ...group.children]
                  : group.children
                ).map((item) => (
                  <FooterLink key={item.id} item={item} />
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
    </footer>
  );
}
