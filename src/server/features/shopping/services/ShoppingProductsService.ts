import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { fetchGoogleProductsTaskResult } from "@/server/lib/dataforseo/merchant";
import { AppError } from "@/server/lib/errors";
import { ShoppingRepository } from "@/server/features/shopping/repositories/ShoppingRepository";
import {
  decodeShoppingListings,
  decodeShoppingPriceStats,
  type ShoppingListing,
  type ShoppingPriceStats,
} from "@/server/features/shopping/shoppingJsonCodecs";
import { parseMerchantListing } from "@/server/features/shopping/services/merchantListingParsing";
import { computePriceStats } from "@/server/features/shopping/services/shoppingPriceStats";

// Default and max listing depth. DataForSEO's own validation is the real
// bound (unverified in this sandbox — see merchant.ts); this cap exists so a
// caller can't accidentally request an unbounded, unbounded-cost crawl.
export const DEFAULT_PRODUCTS_DEPTH = 20;
export const MAX_PRODUCTS_DEPTH = 100;

// Inline poll budget for a fresh search, mirroring local-seo-tools.ts's
// pollBusinessTask: Merchant crawls normally settle within tens of seconds,
// so most callers see a completed result in one round trip; a caller that
// times out gets the runId back to resume for free.
const POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 4000;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ProductSearchResult = {
  runId: string;
  status: "processing" | "completed" | "failed";
  keyword: string;
  locationCode: number;
  languageCode: string;
  listings: ShoppingListing[];
  priceStats: ShoppingPriceStats | null;
  errorMessage: string | null;
  createdAt: string;
};

/** Applies one task_get poll's outcome to a pending run row, then returns the
 *  resulting state. Used both by the inline poll loop below and by an
 *  explicit resume call — a run already completed/failed is never re-polled. */
async function advanceRun(
  row: NonNullable<
    Awaited<ReturnType<typeof ShoppingRepository.getProductSearch>>
  >,
  projectDomain: string | null,
): Promise<ProductSearchResult> {
  if (row.status !== "pending") {
    return {
      runId: row.id,
      status: row.status,
      keyword: row.keyword,
      locationCode: row.locationCode,
      languageCode: row.languageCode,
      listings: decodeShoppingListings(row.listingsJson),
      priceStats: decodeShoppingPriceStats(row.priceStatsJson),
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
    };
  }

  let outcome: Awaited<ReturnType<typeof fetchGoogleProductsTaskResult>>;
  try {
    outcome = await fetchGoogleProductsTaskResult(row.taskId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ShoppingRepository.failProductSearch(row.id, {
      errorMessage: message,
      completedAt: new Date().toISOString(),
    });
    return {
      runId: row.id,
      status: "failed",
      keyword: row.keyword,
      locationCode: row.locationCode,
      languageCode: row.languageCode,
      listings: [],
      priceStats: null,
      errorMessage: message,
      createdAt: row.createdAt,
    };
  }

  if (outcome.status === "pending") {
    return {
      runId: row.id,
      status: "processing",
      keyword: row.keyword,
      locationCode: row.locationCode,
      languageCode: row.languageCode,
      listings: [],
      priceStats: null,
      errorMessage: null,
      createdAt: row.createdAt,
    };
  }

  const listings = outcome.items.map((item) =>
    parseMerchantListing(item, projectDomain),
  );
  const priceStats = computePriceStats(listings);
  const completedAt = new Date().toISOString();
  await ShoppingRepository.completeProductSearch(row.id, {
    listingsJson: JSON.stringify(listings),
    priceStatsJson: priceStats ? JSON.stringify(priceStats) : null,
    completedAt,
  });

  return {
    runId: row.id,
    status: "completed",
    keyword: row.keyword,
    locationCode: row.locationCode,
    languageCode: row.languageCode,
    listings,
    priceStats,
    errorMessage: null,
    createdAt: row.createdAt,
  };
}

async function pollUntilSettledOrTimeout(
  runId: string,
  projectId: string,
  projectDomain: string | null,
): Promise<ProductSearchResult> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    if (attempt > 0) await wait(POLL_INTERVAL_MS);
    const row = await ShoppingRepository.getProductSearch(runId, projectId);
    if (!row)
      throw new AppError("NOT_FOUND", "Shopping research run not found");
    const result = await advanceRun(row, projectDomain);
    if (result.status !== "processing") return result;
  }
  return {
    runId,
    status: "processing",
    keyword: "",
    locationCode: 0,
    languageCode: "",
    listings: [],
    priceStats: null,
    errorMessage: null,
    createdAt: "",
  };
}

async function search(
  input: {
    projectId: string;
    keyword: string;
    locationCode: number;
    languageCode: string;
    depth?: number;
    projectDomain: string | null;
    userId: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<ProductSearchResult> {
  const client = createDataforseoClient(billingCustomer);
  const depth = Math.min(
    input.depth ?? DEFAULT_PRODUCTS_DEPTH,
    MAX_PRODUCTS_DEPTH,
  );
  const taskId = await client.merchant.productsTaskPost({
    keyword: input.keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    depth,
  });

  const runId = crypto.randomUUID();
  await ShoppingRepository.createProductSearch({
    id: runId,
    projectId: input.projectId,
    keyword: input.keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    taskId,
    createdByUserId: input.userId,
  });

  return pollUntilSettledOrTimeout(runId, input.projectId, input.projectDomain);
}

/** Resumes a run that previously returned "processing" (or simply re-reads
 *  one that's already settled). No new credits spent — task_get is free. */
async function resume(
  runId: string,
  projectId: string,
  projectDomain: string | null,
): Promise<ProductSearchResult> {
  const row = await ShoppingRepository.getProductSearch(runId, projectId);
  if (!row) throw new AppError("NOT_FOUND", "Shopping research run not found");
  if (row.status !== "pending") return advanceRun(row, projectDomain);
  return pollUntilSettledOrTimeout(runId, projectId, projectDomain);
}

/** Single, non-looping poll step — what the web UI calls on a refetch
 *  interval so each request resolves quickly instead of holding the
 *  connection open for the MCP tool's multi-attempt loop. */
async function pollOnce(
  runId: string,
  projectId: string,
  projectDomain: string | null,
): Promise<ProductSearchResult> {
  const row = await ShoppingRepository.getProductSearch(runId, projectId);
  if (!row) throw new AppError("NOT_FOUND", "Shopping research run not found");
  return advanceRun(row, projectDomain);
}

type ProductSearchSummary = {
  runId: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
  status: "pending" | "completed" | "failed";
  createdAt: string;
};

async function listSearches(
  projectId: string,
): Promise<ProductSearchSummary[]> {
  const rows = await ShoppingRepository.listProductSearches(projectId);
  return rows.map((row) => ({
    runId: row.id,
    keyword: row.keyword,
    locationCode: row.locationCode,
    languageCode: row.languageCode,
    status: row.status,
    createdAt: row.createdAt,
  }));
}

export const ShoppingProductsService = {
  search,
  resume,
  pollOnce,
  listSearches,
};
