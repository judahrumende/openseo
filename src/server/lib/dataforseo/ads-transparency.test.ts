import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import {
  fetchAdsAdvertisers,
  fetchAdsSearch,
} from "@/server/lib/dataforseo/ads-transparency";

function stubDataforseo(payload: unknown) {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(payload));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestOf(fetchMock: ReturnType<typeof stubDataforseo>) {
  const [url, init] = fetchMock.mock.calls[0];
  const rawUrl = typeof url === "string" || url instanceof URL ? url : url.url;
  const body = init?.body;
  return {
    url: rawUrl.toString(),
    body: typeof body === "string" ? (JSON.parse(body) as unknown) : null,
  };
}

const okTask = (path: string[], items: unknown[]) => ({
  status_code: 20000,
  tasks: [{ status_code: 20000, path, cost: 0.003, result: [{ items }] }],
});

describe("serp/google/ads_advertisers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts keyword + market and returns the item rows", async () => {
    const fetchMock = stubDataforseo(
      okTask(
        ["v3", "serp", "google", "ads_advertisers", "live", "advanced"],
        [{ advertiser_id: "AR01", domain: "competitor.example" }],
      ),
    );

    const result = await fetchAdsAdvertisers({
      keyword: "sim racing pedals",
      locationCode: 2036,
      languageCode: "en",
    });

    const { url, body } = requestOf(fetchMock);
    expect(url).toBe(
      "https://api.dataforseo.com/v3/serp/google/ads_advertisers/live/advanced",
    );
    expect(body).toEqual([
      {
        keyword: "sim racing pedals",
        location_code: 2036,
        language_code: "en",
      },
    ]);
    expect(result.data).toEqual([
      { advertiser_id: "AR01", domain: "competitor.example" },
    ]);
    expect(result.billing.costUsd).toBe(0.003);
  });

  it("treats a charged 'no search results' task as an empty success", async () => {
    stubDataforseo({
      status_code: 20000,
      tasks: [
        {
          status_code: 40501,
          status_message: "No Search Results.",
          path: ["v3", "serp", "google", "ads_advertisers", "live", "advanced"],
          cost: 0.003,
        },
      ],
    });

    const result = await fetchAdsAdvertisers({
      keyword: "an obscure keyword",
      locationCode: 2036,
      languageCode: "en",
    });

    expect(result.data).toEqual([]);
    expect(result.billing.costUsd).toBe(0.003);
  });
});

describe("serp/google/ads_search", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts advertiser_ids and returns the ad creative rows", async () => {
    const fetchMock = stubDataforseo(
      okTask(
        ["v3", "serp", "google", "ads_search", "live", "advanced"],
        [{ title: "Best Pedals", description: "Free shipping" }],
      ),
    );

    const result = await fetchAdsSearch({
      advertiserIds: ["AR01", "AR02"],
      locationCode: 2036,
      languageCode: "en",
    });

    const { body } = requestOf(fetchMock);
    expect(body).toEqual([
      {
        advertiser_ids: ["AR01", "AR02"],
        location_code: 2036,
        language_code: "en",
      },
    ]);
    expect(result.data).toEqual([
      { title: "Best Pedals", description: "Free shipping" },
    ]);
  });
});
