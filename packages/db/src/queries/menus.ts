import { MENU_LOCATIONS } from "@sitebuilder/schema";
import type { Executor } from "../executor";
import { menus } from "../schema/site";

// Creates the two menu rows with empty items where they don't exist yet (design §4.4).
export async function ensureMenus(db: Executor): Promise<void> {
  await db
    .insert(menus)
    .values(MENU_LOCATIONS.map((location) => ({ location, items: [] })))
    .onConflictDoNothing({ target: menus.location });
}
