import { describe, expect, it } from "vitest";
import { domainMatches, parseMerchantListing } from "./merchantListingParsing";

describe("domainMatches", () => {
  it("matches exact and www-prefixed domains case-insensitively", () => {
    expect(domainMatches("Example.com", "example.com")).toBe(true);
    expect(domainMatches("www.example.com", "example.com")).toBe(true);
  });

  it("matches a genuine subdomain", () => {
    expect(domainMatches("shop.example.com", "example.com")).toBe(true);
  });

  it("does not match an unrelated domain that merely shares a suffix", () => {
    expect(domainMatches("notexample.com", "example.com")).toBe(false);
  });

  it("returns false for a null candidate", () => {
    expect(domainMatches(null, "example.com")).toBe(false);
  });
});

describe("parseMerchantListing", () => {
  it("extracts a nested price object and flags the project's own domain", () => {
    const listing = parseMerchantListing(
      {
        rank_absolute: 3,
        title: "Sim Racing Wheel",
        url: "https://shop.hyperlabs.com.au/products/wheel",
        domain: "shop.hyperlabs.com.au",
        price: { current: 499.99, currency: "AUD" },
        rating: { value: 4.6, votes_count: 120 },
      },
      "hyperlabs.com.au",
    );

    expect(listing).toMatchObject({
      position: 3,
      title: "Sim Racing Wheel",
      price: 499.99,
      currency: "AUD",
      sellerDomain: "shop.hyperlabs.com.au",
      rating: 4.6,
      ratingCount: 120,
      isProjectDomain: true,
    });
  });

  it("falls back to a bare numeric price and derives the domain from the url", () => {
    const listing = parseMerchantListing(
      {
        title: "Competitor Wheel",
        url: "https://www.competitor.example/product",
        price: 349,
        currency: "AUD",
      },
      "hyperlabs.com.au",
    );

    expect(listing.price).toBe(349);
    expect(listing.sellerDomain).toBe("www.competitor.example");
    expect(listing.isProjectDomain).toBe(false);
  });

  it("degrades to nulls instead of throwing on a missing/renamed field", () => {
    const listing = parseMerchantListing({ some_unexpected_field: 1 }, null);

    expect(listing).toEqual({
      position: null,
      title: null,
      url: null,
      seller: null,
      sellerDomain: null,
      price: null,
      currency: null,
      rating: null,
      ratingCount: null,
      isProjectDomain: false,
    });
  });
});
