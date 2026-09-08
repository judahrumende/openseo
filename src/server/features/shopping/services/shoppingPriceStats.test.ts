import { describe, expect, it } from "vitest";
import { computePriceStats } from "./shoppingPriceStats";
import type { ShoppingListing } from "@/server/features/shopping/shoppingJsonCodecs";

function listing(overrides: Partial<ShoppingListing> = {}): ShoppingListing {
  return {
    position: null,
    title: null,
    url: null,
    sellerDomain: null,
    seller: null,
    price: null,
    currency: null,
    rating: null,
    ratingCount: null,
    isProjectDomain: false,
    ...overrides,
  };
}

describe("computePriceStats", () => {
  it("returns null when no listing has a price", () => {
    expect(computePriceStats([listing(), listing({ price: null })])).toBeNull();
  });

  it("computes min/max/median for an odd count without mutating input order", () => {
    const listings = [
      listing({ price: 300, currency: "USD" }),
      listing({ price: 100, currency: "USD" }),
      listing({ price: 200, currency: "USD" }),
    ];
    const stats = computePriceStats(listings);
    expect(stats).toEqual({
      min: 100,
      max: 300,
      median: 200,
      currency: "USD",
      sampleSize: 3,
    });
    // The sort used to build the stats must not have mutated the caller's array.
    expect(listings.map((l) => l.price)).toEqual([300, 100, 200]);
  });

  it("averages the two middle values for an even count", () => {
    const stats = computePriceStats([
      listing({ price: 100 }),
      listing({ price: 200 }),
      listing({ price: 300 }),
      listing({ price: 400 }),
    ]);
    expect(stats?.median).toBe(250);
  });

  it("ignores unpriced listings when computing the sample size", () => {
    const stats = computePriceStats([
      listing({ price: 100, currency: "USD" }),
      listing({ price: null }),
      listing({ price: 200, currency: "USD" }),
    ]);
    expect(stats?.sampleSize).toBe(2);
  });

  it("falls back to null currency when no priced listing has one", () => {
    const stats = computePriceStats([listing({ price: 100, currency: null })]);
    expect(stats?.currency).toBeNull();
  });
});
