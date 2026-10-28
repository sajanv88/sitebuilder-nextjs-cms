// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { SearchIcon } from "@nuvui/icons";
import {
  Button,
  Navbar,
  NavbarActions,
  NavbarBrand,
  NavbarLink,
  NavbarMenu,
  NavbarNav,
} from "@nuvui/react";
import type { MenuItem, SiteLayoutProps } from "@sitebuilder/template-sdk";

// The frame of every page: the firm's name and tagline over a ruled line, the menu and a search
// link, the page, and a footer with its own menu. A group in the menu is shown as its links, one
// level only. The width option sets the page's column (styles/_ledger.scss).

function links(items: readonly MenuItem[]): MenuItem[] {
  return items.flatMap((item) => (item.href ? [item] : item.children.filter((c) => c.href)));
}

const newTab = (item: MenuItem) =>
  item.openInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {};

export default function Site({
  site,
  menus,
  currentPath,
  searchPath,
  options,
  children,
}: SiteLayoutProps) {
  const primary = links(menus.primary);
  const footer = links(menus.footer);
  const items = primary.map((item) => (
    <NavbarLink
      key={item.id}
      href={item.href ?? undefined}
      current={item.href === currentPath}
      {...newTab(item)}
    >
      {item.label}
    </NavbarLink>
  ));
  return (
    <div className={options.width === "wide" ? "ledger ledger--wide" : "ledger"}>
      <a className="ledger__skip" href="#content">
        Skip to content
      </a>
      <Navbar sticky className="ledger-header">
        <NavbarBrand>
          <a className="ledger-header__brand" href="/">
            <span className="ledger-header__name">{site.title}</span>
            {site.tagline ? <span className="ledger-header__tagline">{site.tagline}</span> : null}
          </a>
        </NavbarBrand>
        {primary.length > 0 ? (
          <NavbarNav aria-label="Main" className="ledger-header__nav">
            {items}
          </NavbarNav>
        ) : null}
        {primary.length > 0 || searchPath ? (
          <NavbarActions className="ledger-header__actions">
            {searchPath ? (
              <Button asChild intent="ghost" size="sm">
                <a
                  href={searchPath}
                  aria-label="Search"
                  {...(currentPath === searchPath ? { "aria-current": "page" as const } : {})}
                >
                  <SearchIcon aria-hidden="true" size={18} />
                </a>
              </Button>
            ) : null}
            {primary.length > 0 ? (
              <NavbarMenu>
                <nav aria-label="Main" className="ledger-header__menu">
                  {items}
                </nav>
              </NavbarMenu>
            ) : null}
          </NavbarActions>
        ) : null}
      </Navbar>
      <main id="content" className="ledger__main">
        {children}
      </main>
      <footer className="ledger-footer">
        <div className="ledger-footer__inner">
          <p className="ledger-footer__name">{site.title}</p>
          {footer.length > 0 ? (
            <nav aria-label="Footer">
              <ul className="ledger-footer__links">
                {footer.map((item) => (
                  <li key={item.id}>
                    <a
                      className="ledger-footer__link"
                      href={item.href ?? undefined}
                      {...newTab(item)}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
