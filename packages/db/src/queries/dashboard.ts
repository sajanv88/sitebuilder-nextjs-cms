import type { EntryKind } from "@sitebuilder/schema";
import { and, count, desc, eq, isNull, type SQL } from "drizzle-orm";
import type { Executor } from "../executor";
import { user } from "../schema/auth-schema";
import { type EntryStatus, entries } from "../schema/entries";
import { media } from "../schema/media";

// The admin's dashboard: how much there is, and what changed last. The caller says which
// entries the viewer may see; this only counts and lists them.

export interface DashboardScope {
  // Pages are counted only for someone who may read them.
  pages: boolean;
  // Set for someone who may see only their own posts and files (an author).
  ownerId: string | null;
}

export interface DashboardCounts {
  published: Record<EntryKind, number>;
  drafts: number;
  scheduled: number;
  media: number;
}

export interface RecentEntry {
  id: string;
  type: EntryKind;
  title: string;
  status: EntryStatus;
  updatedAt: Date;
  authorName: string;
}

function visible(scope: DashboardScope): SQL | undefined {
  return and(
    isNull(entries.deletedAt),
    scope.pages ? undefined : eq(entries.type, "post"),
    scope.ownerId ? eq(entries.authorId, scope.ownerId) : undefined,
  );
}

export async function dashboardCounts(
  db: Executor,
  scope: DashboardScope,
): Promise<DashboardCounts> {
  const rows = await db
    .select({ type: entries.type, status: entries.status, total: count() })
    .from(entries)
    .where(visible(scope))
    .groupBy(entries.type, entries.status);
  const of = (type: EntryKind | null, status: EntryStatus) =>
    rows
      .filter((row) => row.status === status && (type === null || row.type === type))
      .reduce((sum, row) => sum + row.total, 0);
  const [files] = await db
    .select({ total: count() })
    .from(media)
    .where(scope.ownerId ? eq(media.uploadedBy, scope.ownerId) : undefined);
  return {
    published: { page: of("page", "published"), post: of("post", "published") },
    drafts: of(null, "draft"),
    scheduled: of(null, "scheduled"),
    media: files?.total ?? 0,
  };
}

// The entries changed last, newest first.
export async function recentEntries(
  db: Executor,
  scope: DashboardScope,
  limit = 8,
): Promise<RecentEntry[]> {
  return db
    .select({
      id: entries.id,
      type: entries.type,
      title: entries.title,
      status: entries.status,
      updatedAt: entries.updatedAt,
      authorName: user.name,
    })
    .from(entries)
    .innerJoin(user, eq(user.id, entries.authorId))
    .where(visible(scope))
    .orderBy(desc(entries.updatedAt))
    .limit(limit);
}
