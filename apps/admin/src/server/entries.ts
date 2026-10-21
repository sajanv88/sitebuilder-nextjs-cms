import "server-only";
import { db, type EntryList, getEntryOwner, listEntries } from "@sitebuilder/db";
import type { EntryKind, EntryListQuery } from "@sitebuilder/schema";
import { type Action, can, type Resource } from "@/auth/can";
import type { Viewer } from "@/auth/session";

// The data layer for entries: each function is given the signed-in viewer, checks can() against
// the entry itself, then calls the query. Server Actions and pages both go through here.

// A list of the viewer's posts or pages: everyone's when the role may read any, otherwise only
// their own (an author's Posts screen, §6.2). The page has already checked canSome(read).
export async function listEntriesFor(
  viewer: Viewer,
  type: EntryKind,
  query: EntryListQuery,
): Promise<EntryList> {
  const authorId = can(viewer, `${type}.read`) ? null : viewer.id;
  return listEntries(db, { ...query, type, authorId });
}

type EntryVerb = "read" | "update" | "publish" | "trash" | "delete";

// Loads the entry's owner and asks can(viewer, "<type>.<verb>", { type, ownerId }). Undefined when
// the entry doesn't exist or the viewer may not: the caller says "not found" either way, so an
// author can't learn which ids belong to other people's drafts.
export async function authorizeEntry(
  viewer: Viewer,
  id: string,
  verb: EntryVerb,
): Promise<{ type: EntryKind; authorId: string } | undefined> {
  const owner = await getEntryOwner(db, id);
  if (!owner) return undefined;
  const action: Action = `${owner.type}.${verb}`;
  const resource: Resource = { type: owner.type, ownerId: owner.authorId };
  return can(viewer, action, resource) ? owner : undefined;
}
