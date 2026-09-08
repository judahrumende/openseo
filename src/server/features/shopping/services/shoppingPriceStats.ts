import type { ShoppingListing } from "@/server/features/shopping/shoppingJsonCodecs";

/** Price-band summary (min/max/median) over a run's priced listings. Pulled
 *  out of ShoppingProductsService as a pure function, same split as
 *  contentAuditScoring.ts, so the median/currency edge cases are directly
 *  testable without mocking the DataForSEO client or the DB. */
export function computePriceStats(listings: ShoppingListing[]): {
  min: number;
  max: number;
  median: number;
  currency: string | null;
  sampleSize: number;
} | null {
  const priced = listings.filter(
    (listing): listing is ShoppingListing & { price: number } =>
      listing.price != null,
  );
  if (priced.length === 0) return null;

  // oxlint-disable-next-line unicorn/no-array-sort -- local array, not reused after this
  const sorted = [...priced].sort((a, b) => a.price - b.price);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1].price + sorted[mid].price) / 2
      : sorted[mid].price;

  return {
    min: sorted[0].price,
    max: sorted[sorted.length - 1].price,
    median,
    currency: priced.find((listing) => listing.currency)?.currency ?? null,
    sampleSize: priced.length,
  };
}
