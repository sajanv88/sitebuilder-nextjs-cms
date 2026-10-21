// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import {
  Navbar,
  NavbarActions,
  NavbarBrand,
  NavbarLink,
  NavbarMenu,
  NavbarNav,
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@nuvui/react";
import type { ResolvedMenuItem } from "@sitebuilder/db";
import "./site-header.scss";

// The site's top bar, after nuvui's nav-bar block: the site's name and the primary menu
// (design §7). A group, or a link with children, opens a panel; on a phone every link is in
// the panel behind the menu button. Links are plain <a>: every page is drawn on the server.

const newTab = (item: ResolvedMenuItem) =>
  item.openInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {};

// What an entry with children opens: itself first when it's a link, then its children. A
// trigger can't be a link as well (nuvui's NavigationMenu page).
function panelLinks(item: ResolvedMenuItem): ResolvedMenuItem[] {
  return item.href ? [{ ...item, children: [] }, ...item.children] : item.children;
}

export function SiteHeader({
  title,
  items,
  currentPath,
}: {
  title: string;
  items: ResolvedMenuItem[];
  currentPath: string;
}) {
  const isCurrent = (item: ResolvedMenuItem) => item.href === currentPath;
  return (
    <>
      <a className="site-header__skip" href="#content">
        Skip to content
      </a>
      <Navbar sticky className="site-header">
        <NavbarBrand>
          <a className="site-header__brand" href="/">
            {title}
          </a>
        </NavbarBrand>
        {items.length > 0 ? (
          <NavbarNav asChild>
            <NavigationMenu aria-label="Main">
              <NavigationMenuList>
                {items.map((item) =>
                  item.children.length > 0 ? (
                    <NavigationMenuItem key={item.id}>
                      <NavigationMenuTrigger>{item.label}</NavigationMenuTrigger>
                      <NavigationMenuContent>
                        <ul className="site-header__panel">
                          {panelLinks(item).map((link) => (
                            <li key={link.id}>
                              <NavigationMenuLink
                                href={link.href ?? undefined}
                                active={isCurrent(link)}
                                {...newTab(link)}
                              >
                                {link.label}
                              </NavigationMenuLink>
                            </li>
                          ))}
                        </ul>
                      </NavigationMenuContent>
                    </NavigationMenuItem>
                  ) : (
                    <NavigationMenuItem key={item.id}>
                      <NavigationMenuLink
                        href={item.href ?? undefined}
                        active={isCurrent(item)}
                        {...newTab(item)}
                      >
                        {item.label}
                      </NavigationMenuLink>
                    </NavigationMenuItem>
                  ),
                )}
              </NavigationMenuList>
            </NavigationMenu>
          </NavbarNav>
        ) : null}
        {items.length > 0 ? (
          <NavbarActions>
            <NavbarMenu>
              <nav aria-label="Main" className="site-header__menu">
                {items.map((item) =>
                  item.children.length > 0 ? (
                    <div key={item.id} className="site-header__group">
                      <p className="site-header__group-label">{item.label}</p>
                      {panelLinks(item).map((link) => (
                        <NavbarLink
                          key={link.id}
                          href={link.href ?? undefined}
                          current={isCurrent(link)}
                          {...newTab(link)}
                        >
                          {link.label}
                        </NavbarLink>
                      ))}
                    </div>
                  ) : (
                    <NavbarLink
                      key={item.id}
                      href={item.href ?? undefined}
                      current={isCurrent(item)}
                      {...newTab(item)}
                    >
                      {item.label}
                    </NavbarLink>
                  ),
                )}
              </nav>
            </NavbarMenu>
          </NavbarActions>
        ) : null}
      </Navbar>
    </>
  );
}
