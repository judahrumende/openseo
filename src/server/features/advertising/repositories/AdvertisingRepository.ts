import { and, desc, eq } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { db } from "@/db";
import {
  advertisingAdCopyDrafts,
  advertisingAdCopySearches,
  advertisingAdvertiserSearches,
} from "@/db/schema";

const DEFAULT_HISTORY_LIMIT = 20;

// ---------------------------------------------------------------------------
// Advertiser searches (ads_advertisers)
// ---------------------------------------------------------------------------

async function createAdvertiserSearch(
  data: InferInsertModel<typeof advertisingAdvertiserSearches>,
) {
  await db.insert(advertisingAdvertiserSearches).values(data);
}

async function getAdvertiserSearch(id: string, projectId: string) {
  const rows = await db
    .select()
    .from(advertisingAdvertiserSearches)
    .where(
      and(
        eq(advertisingAdvertiserSearches.id, id),
        eq(advertisingAdvertiserSearches.projectId, projectId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function listAdvertiserSearches(
  projectId: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
) {
  return db
    .select()
    .from(advertisingAdvertiserSearches)
    .where(eq(advertisingAdvertiserSearches.projectId, projectId))
    .orderBy(desc(advertisingAdvertiserSearches.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Ad copy searches (ads_search)
// ---------------------------------------------------------------------------

async function createAdCopySearch(
  data: InferInsertModel<typeof advertisingAdCopySearches>,
) {
  await db.insert(advertisingAdCopySearches).values(data);
}

async function getAdCopySearch(id: string, projectId: string) {
  const rows = await db
    .select()
    .from(advertisingAdCopySearches)
    .where(
      and(
        eq(advertisingAdCopySearches.id, id),
        eq(advertisingAdCopySearches.projectId, projectId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function listAdCopySearches(
  projectId: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
) {
  return db
    .select()
    .from(advertisingAdCopySearches)
    .where(eq(advertisingAdCopySearches.projectId, projectId))
    .orderBy(desc(advertisingAdCopySearches.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// AI ad copy drafts
// ---------------------------------------------------------------------------

async function createAdCopyDraft(
  data: InferInsertModel<typeof advertisingAdCopyDrafts>,
) {
  await db.insert(advertisingAdCopyDrafts).values(data);
}

async function getAdCopyDraft(id: string, projectId: string) {
  const rows = await db
    .select()
    .from(advertisingAdCopyDrafts)
    .where(
      and(
        eq(advertisingAdCopyDrafts.id, id),
        eq(advertisingAdCopyDrafts.projectId, projectId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function listAdCopyDrafts(
  projectId: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
) {
  return db
    .select()
    .from(advertisingAdCopyDrafts)
    .where(eq(advertisingAdCopyDrafts.projectId, projectId))
    .orderBy(desc(advertisingAdCopyDrafts.createdAt))
    .limit(limit);
}

export const AdvertisingRepository = {
  createAdvertiserSearch,
  getAdvertiserSearch,
  listAdvertiserSearches,
  createAdCopySearch,
  getAdCopySearch,
  listAdCopySearches,
  createAdCopyDraft,
  getAdCopyDraft,
  listAdCopyDrafts,
};
