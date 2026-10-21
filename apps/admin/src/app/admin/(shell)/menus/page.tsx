// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nuvui/react";
import { db, getEntryLinks, getMenu, listTermOptions } from "@sitebuilder/db";
import type { Menu, MenuLocation } from "@sitebuilder/schema";
import type { Metadata } from "next";
import type { MenuTarget } from "@/actions/menus";
import { requirePermission } from "@/auth/session";
import { AdminPage } from "@/components/admin-page/admin-page";
import { MenuEditor } from "@/components/menu-editor/menu-editor";
import "./menus.scss";

export const metadata: Metadata = { title: "Menus" };

const MENUS: { location: MenuLocation; name: string; about: string }[] = [
  {
    location: "primary",
    name: "Primary menu",
    about: "Across the top of every page. Items with items under them open a panel.",
  },
  {
    location: "footer",
    name: "Footer menu",
    about: "At the foot of every page. Each group becomes a list under its label.",
  },
];

function entryIds(menu: Menu): string[] {
  return menu
    .flatMap((item) => [item, ...(item.children ?? [])])
    .flatMap((item) => (item.kind === "entry" ? [item.entryId] : []));
}

// The two menus (design §4.4, §5.3). menu.update covers this screen (§6.1).
export default async function MenusPage() {
  await requirePermission("menu.update");
  const menus = await Promise.all(MENUS.map(({ location }) => getMenu(db, location)));
  const links = await getEntryLinks(db, menus.flatMap(entryIds));
  const entries: Record<string, MenuTarget> = Object.fromEntries(
    [...links.values()].map((link) => [
      link.id,
      { id: link.id, title: link.title, path: link.path, type: link.type, public: link.public },
    ]),
  );
  const terms = await listTermOptions(db);

  return (
    <AdminPage
      title="Menus"
      description="The links across the top of every page, and in the footer. Links to pages and posts follow them when their address changes."
      width="wide"
    >
      {/* Both stay mounted, so unsaved changes in one survive a look at the other. */}
      <Tabs defaultValue="primary" className="menus">
        <TabsList>
          {MENUS.map(({ location, name }) => (
            <TabsTrigger key={location} value={location}>
              {name}
            </TabsTrigger>
          ))}
        </TabsList>
        {MENUS.map(({ location, name, about }, index) => (
          <TabsContent key={location} value={location} forceMount className="menus__panel">
            <p className="menus__about">{about}</p>
            <MenuEditor
              location={location}
              name={name}
              initial={menus[index] ?? []}
              entries={entries}
              terms={terms}
            />
          </TabsContent>
        ))}
      </Tabs>
    </AdminPage>
  );
}
