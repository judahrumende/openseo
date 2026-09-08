import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import { AdvertisingRepository } from "@/server/features/advertising/repositories/AdvertisingRepository";
import {
  decodeRawJsonArray,
  decodeStringList,
} from "@/server/features/advertising/advertisingJsonCodecs";
import type { JsonRecord } from "@/shared/json";

// DataForSEO's own validation is the real bound on how many advertiser ids one
// ads_search call accepts (unverified in this sandbox — see
// ads-transparency.ts); this cap just keeps the app from building an
// unbounded request.
export const MAX_ADVERTISER_IDS_PER_SEARCH = 20;

function readString(source: unknown, key: string): string | null {
  if (typeof source !== "object" || source === null) return null;
  const value: unknown = Reflect.get(source, key);
  return typeof value === "string" ? value : null;
}

/** DataForSEO's response field for an advertiser's id is unverified in this
 *  sandbox — try the plausible names rather than committing to one. */
export function extractAdvertiserId(row: JsonRecord): string | null {
  return (
    readString(row, "advertiser_id") ??
    readString(row, "advertiserId") ??
    readString(row, "id")
  );
}

type AdvertiserSearchResult = {
  searchId: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
  advertisers: JsonRecord[];
  createdAt: string;
};

async function searchAdvertisers(
  input: {
    projectId: string;
    keyword: string;
    locationCode: number;
    languageCode: string;
    userId: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<AdvertiserSearchResult> {
  const client = createDataforseoClient(billingCustomer);
  const advertisers = await client.adsTransparency.advertisers({
    keyword: input.keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const searchId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await AdvertisingRepository.createAdvertiserSearch({
    id: searchId,
    projectId: input.projectId,
    keyword: input.keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    advertisersJson: JSON.stringify(advertisers),
    createdByUserId: input.userId,
  });

  return {
    searchId,
    keyword: input.keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    advertisers,
    createdAt,
  };
}

async function getAdvertiserSearch(searchId: string, projectId: string) {
  const row = await AdvertisingRepository.getAdvertiserSearch(
    searchId,
    projectId,
  );
  if (!row) return null;
  return {
    searchId: row.id,
    keyword: row.keyword,
    locationCode: row.locationCode,
    languageCode: row.languageCode,
    advertisers: decodeRawJsonArray(row.advertisersJson),
    createdAt: row.createdAt,
  };
}

async function listAdvertiserSearches(projectId: string) {
  const rows = await AdvertisingRepository.listAdvertiserSearches(projectId);
  return rows.map((row) => ({
    searchId: row.id,
    keyword: row.keyword,
    locationCode: row.locationCode,
    languageCode: row.languageCode,
    createdAt: row.createdAt,
  }));
}

type AdCopySearchResult = {
  searchId: string;
  advertiserIds: string[];
  ads: JsonRecord[];
  createdAt: string;
};

async function searchAdCopy(
  input: {
    projectId: string;
    advertiserIds: string[];
    advertiserSearchId?: string;
    locationCode: number;
    languageCode: string;
    userId: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<AdCopySearchResult> {
  if (
    input.advertiserIds.length === 0 ||
    input.advertiserIds.length > MAX_ADVERTISER_IDS_PER_SEARCH
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `advertiserIds must have 1-${MAX_ADVERTISER_IDS_PER_SEARCH} entries, got ${input.advertiserIds.length}`,
    );
  }

  const client = createDataforseoClient(billingCustomer);
  const ads = await client.adsTransparency.search({
    advertiserIds: input.advertiserIds,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const searchId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await AdvertisingRepository.createAdCopySearch({
    id: searchId,
    projectId: input.projectId,
    advertiserSearchId: input.advertiserSearchId ?? null,
    advertiserIdsJson: JSON.stringify(input.advertiserIds),
    adsJson: JSON.stringify(ads),
    createdByUserId: input.userId,
  });

  return { searchId, advertiserIds: input.advertiserIds, ads, createdAt };
}

async function getAdCopySearch(searchId: string, projectId: string) {
  const row = await AdvertisingRepository.getAdCopySearch(searchId, projectId);
  if (!row) return null;
  return {
    searchId: row.id,
    advertiserIds: decodeStringList(row.advertiserIdsJson),
    ads: decodeRawJsonArray(row.adsJson),
    createdAt: row.createdAt,
  };
}

async function listAdCopySearches(projectId: string) {
  const rows = await AdvertisingRepository.listAdCopySearches(projectId);
  return rows.map((row) => ({
    searchId: row.id,
    advertiserIds: decodeStringList(row.advertiserIdsJson),
    createdAt: row.createdAt,
  }));
}

export const AdvertisingResearchService = {
  searchAdvertisers,
  getAdvertiserSearch,
  listAdvertiserSearches,
  searchAdCopy,
  getAdCopySearch,
  listAdCopySearches,
};
