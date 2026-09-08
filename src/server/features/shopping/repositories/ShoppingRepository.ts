import { and, desc, eq } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { db } from "@/db";
import { shoppingDomainOverviews, shoppingProductSearches } from "@/db/schema";

const DEFAULT_HISTORY_LIMIT = 20;

// ---------------------------------------------------------------------------
// Product searches
// ---------------------------------------------------------------------------

async function createProductSearch(
  data: InferInsertModel<typeof shoppingProductSearches>,
) {
  await db.insert(shoppingProductSearches).values(data);
}

async function getProductSearch(id: string, projectId: string) {
  const rows = await db
    .select()
    .from(shoppingProductSearches)
    .where(
      and(
        eq(shoppingProductSearches.id, id),
        eq(shoppingProductSearches.projectId, projectId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function completeProductSearch(
  id: string,
  data: {
    listingsJson: string;
    priceStatsJson: string | null;
    completedAt: string;
  },
) {
  await db
    .update(shoppingProductSearches)
    .set({ status: "completed", ...data })
    .where(eq(shoppingProductSearches.id, id));
}

async function failProductSearch(
  id: string,
  data: { errorMessage: string; completedAt: string },
) {
  await db
    .update(shoppingProductSearches)
    .set({ status: "failed", ...data })
    .where(eq(shoppingProductSearches.id, id));
}

async function listProductSearches(
  projectId: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
) {
  return db
    .select()
    .from(shoppingProductSearches)
    .where(eq(shoppingProductSearches.projectId, projectId))
    .orderBy(desc(shoppingProductSearches.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Domain overviews
// ---------------------------------------------------------------------------

async function createDomainOverview(
  data: InferInsertModel<typeof shoppingDomainOverviews>,
) {
  await db.insert(shoppingDomainOverviews).values(data);
}

async function getDomainOverview(id: string, projectId: string) {
  const rows = await db
    .select()
    .from(shoppingDomainOverviews)
    .where(
      and(
        eq(shoppingDomainOverviews.id, id),
        eq(shoppingDomainOverviews.projectId, projectId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function completeDomainOverview(
  id: string,
  data: { overviewJson: string | null; completedAt: string },
) {
  await db
    .update(shoppingDomainOverviews)
    .set({ status: "completed", ...data })
    .where(eq(shoppingDomainOverviews.id, id));
}

async function failDomainOverview(
  id: string,
  data: { errorMessage: string; completedAt: string },
) {
  await db
    .update(shoppingDomainOverviews)
    .set({ status: "failed", ...data })
    .where(eq(shoppingDomainOverviews.id, id));
}

async function listDomainOverviews(
  projectId: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
) {
  return db
    .select()
    .from(shoppingDomainOverviews)
    .where(eq(shoppingDomainOverviews.projectId, projectId))
    .orderBy(desc(shoppingDomainOverviews.createdAt))
    .limit(limit);
}

export const ShoppingRepository = {
  createProductSearch,
  getProductSearch,
  completeProductSearch,
  failProductSearch,
  listProductSearches,
  createDomainOverview,
  getDomainOverview,
  completeDomainOverview,
  failDomainOverview,
  listDomainOverviews,
};
