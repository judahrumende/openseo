import { dataforseoPost } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  type DataforseoApiResponse,
  type DataforseoItemsTask,
} from "@/server/lib/dataforseo/envelope";
import type { JsonRecord } from "@/shared/json";

// ---------------------------------------------------------------------------
// SERP Ads Transparency endpoints — Google Ads Advertisers and Google Ads
// Search, backed by Google's Ads Transparency Center. Confirmed-real endpoint
// paths (docs.dataforseo.com/v3/serp/google/ads_advertisers/live/advanced/,
// .../serp-google-ads_search-live-advanced/), live/advanced like every other
// serp/google/* endpoint in this codebase (see serp.ts) rather than the async
// task pattern merchant.ts uses. As with merchant.ts, this sandbox has no
// DataForSEO API key to verify the exact response shape against a live call,
// so items come back as untyped records — the advertising service extracts
// known fields defensively rather than this file asserting a rigid shape.
//
// Two-step flow: fetchAdsAdvertisers(keyword) finds which advertiser_ids run
// ads against a keyword; fetchAdsSearch(advertiserIds) then pulls those
// advertisers' actual ad creative (title/description text, when the endpoint
// returns it).
// ---------------------------------------------------------------------------

type AdsLocationInput = {
  locationCode?: number;
  locationName?: string;
  languageCode: string;
};

function locationParams(input: AdsLocationInput) {
  return input.locationName
    ? { location_name: input.locationName }
    : { location_code: input.locationCode };
}

export async function fetchAdsAdvertisers(
  input: AdsLocationInput & { keyword: string },
): Promise<DataforseoApiResponse<JsonRecord[]>> {
  const response = await dataforseoPost<DataforseoItemsTask<JsonRecord>>(
    "/v3/serp/google/ads_advertisers/live/advanced",
    [
      {
        keyword: input.keyword,
        ...locationParams(input),
        language_code: input.languageCode,
      },
    ],
  );
  // "No Search Results" is a valid, billed empty outcome — no advertisers
  // found for this keyword/market, not a failure.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: task.result?.[0]?.items ?? [],
    billing: buildTaskBilling(task),
  };
}

export async function fetchAdsSearch(
  input: AdsLocationInput & { advertiserIds: string[] },
): Promise<DataforseoApiResponse<JsonRecord[]>> {
  const response = await dataforseoPost<DataforseoItemsTask<JsonRecord>>(
    "/v3/serp/google/ads_search/live/advanced",
    [
      {
        advertiser_ids: input.advertiserIds,
        ...locationParams(input),
        language_code: input.languageCode,
      },
    ],
  );
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: task.result?.[0]?.items ?? [],
    billing: buildTaskBilling(task),
  };
}
