import type { ShoppingListing } from "@/server/features/shopping/shoppingJsonCodecs";
import type { JsonRecord } from "@/shared/json";

// Defensive field extraction for merchant/google/products result items. The
// exact response shape is unverified in this sandbox (see
// src/server/lib/dataforseo/merchant.ts) — every read here degrades to null
// on a missing/renamed field rather than throwing, so a shape drift shows up
// as sparse data, not a broken feature.

/** Walk a chain of keys through nested unknown records (provider rows).
 *  Returns undefined if any hop isn't an object. Local copy of the same
 *  helper in src/server/mcp/table.ts — that file is MCP-formatting-specific,
 *  this feature reads raw provider rows independently of any MCP tool. */
function readPath(source: unknown, ...path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = Reflect.get(current, key);
  }
  return current;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** DataForSEO SERP-family endpoints usually nest price as
 *  `{current, currency}` or similar; some return a bare number. Try both
 *  rather than committing to one shape. */
function extractPrice(item: JsonRecord): {
  price: number | null;
  currency: string | null;
} {
  const priceField = item.price;
  if (typeof priceField === "number") {
    return { price: priceField, currency: asString(item.currency) };
  }
  return {
    price:
      asNumber(readPath(priceField, "current")) ??
      asNumber(readPath(priceField, "value")) ??
      asNumber(readPath(priceField, "amount")) ??
      asNumber(item.price_from) ??
      null,
    currency:
      asString(readPath(priceField, "currency")) ?? asString(item.currency),
  };
}

function extractSeller(item: JsonRecord): {
  seller: string | null;
  sellerDomain: string | null;
} {
  const sellerField = item.seller;
  const seller =
    asString(sellerField) ??
    asString(readPath(sellerField, "name")) ??
    asString(readPath(sellerField, "title"));
  const sellerDomain =
    asString(item.domain) ??
    asString(readPath(sellerField, "domain")) ??
    extractHostname(asString(item.url));
  return { seller, sellerDomain };
}

function extractHostname(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, "");
}

/** Same-or-subdomain match, matching serp.ts's buildRankCheckResult logic. */
export function domainMatches(
  candidate: string | null,
  targetDomain: string,
): boolean {
  if (!candidate) return false;
  const domain = normalizeDomain(candidate);
  const target = normalizeDomain(targetDomain);
  return domain === target || domain.endsWith(`.${target}`);
}

export function parseMerchantListing(
  item: JsonRecord,
  projectDomain: string | null,
): ShoppingListing {
  const { price, currency } = extractPrice(item);
  const { seller, sellerDomain } = extractSeller(item);
  return {
    position: asNumber(item.rank_group) ?? asNumber(item.rank_absolute) ?? null,
    title: asString(item.title),
    url: asString(item.url),
    seller,
    sellerDomain,
    price,
    currency,
    rating: asNumber(readPath(item.rating, "value")),
    ratingCount:
      asNumber(readPath(item.rating, "votes_count")) ??
      asNumber(readPath(item.rating, "rating_count")),
    isProjectDomain: projectDomain
      ? domainMatches(sellerDomain, projectDomain)
      : false,
  };
}
