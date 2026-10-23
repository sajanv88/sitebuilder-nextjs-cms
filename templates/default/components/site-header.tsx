// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import {
  Button,
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
import type { MenuItem } from "@sitebuilder/template-sdk";

// The site's top bar, after nuvui's nav-bar block: the site's name and the primary menu. A
// group, or a link with children, opens a panel; on a phone every link is in the panel behind
// the menu button. Links are plain <a>: every page is drawn on the server. The template's
// options say whether the bar stays at the top, where the menu sits in it, and whether the
// menu's last link is a button at the end, shown at every width.

const newTab = (item: MenuItem) =>
  item.openInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {};

// What an entry with children opens: itself first when it's a link, then its children. A
// trigger can't be a link as well (nuvui's NavigationMenu page).
function panelLinks(item: MenuItem): readonly MenuItem[] {
  return item.href ? [{ ...item, children: [] }, ...item.children] : item.children;
}

export function SiteHeader({
  title,
  items: all,
  currentPath,
  behaviour,
  menuPosition,
  menuButton,
}: {
  title: string;
  items: readonly MenuItem[];
  currentPath: string;
  behaviour: "sticky" | "hides" | "scrolls";
  menuPosition: "start" | "center" | "end";
  menuButton: boolean;
}) {
  const isCurrent = (item: MenuItem) => item.href === currentPath;
  // The last link, when it's a link of its own (not a group, nothing under it).
  const last = all.at(-1);
  const button = menuButton && last?.href && last.children.length === 0 ? last : null;
  const items = button ? all.slice(0, -1) : all;
  return (
    <>
      <a className="site-header__skip" href="#content">
        Skip to content
      </a>
      <Navbar
        sticky={behaviour === "sticky"}
        hideOnScroll={behaviour === "hides"}
        className={`site-header site-header--menu-${menuPosition}`}
      >
        <NavbarBrand>
          <a className="site-header__brand" href="/">
            {title}
          </a>
        </NavbarBrand>
        {items.length > 0 ? (
          <NavbarNav asChild>
            <NavigationMenu aria-label="Main" className="site-header__nav">
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
        {items.length > 0 || button ? (
          <NavbarActions className="site-header__actions">
            {button?.href ? (
              <Button asChild size="sm">
                <a
                  href={button.href}
                  {...(isCurrent(button) ? { "aria-current": "page" as const } : {})}
                  {...newTab(button)}
                >
                  {button.label}
                </a>
              </Button>
            ) : null}
            {items.length > 0 ? (
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
            ) : null}
          </NavbarActions>
        ) : null}
      </Navbar>
    </>
  );
}
