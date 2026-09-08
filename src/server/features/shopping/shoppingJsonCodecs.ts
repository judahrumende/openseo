import { z } from "zod";
import { jsonCodec, type JsonRecord } from "@/shared/json";

// JSON column codecs for the shopping feature's leaf-list/summary columns
// (see src/db/shopping.schema.ts) — same approach as
// src/server/features/content/contentJsonCodecs.ts.

const shoppingListingSchema = z.object({
  position: z.number().nullable(),
  title: z.string().nullable(),
  url: z.string().nullable(),
  sellerDomain: z.string().nullable(),
  seller: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string().nullable(),
  rating: z.number().nullable(),
  ratingCount: z.number().nullable(),
  isProjectDomain: z.boolean(),
});
export type ShoppingListing = z.infer<typeof shoppingListingSchema>;
const shoppingListingsCodec = jsonCodec(z.array(shoppingListingSchema));

const priceStatsSchema = z.object({
  min: z.number(),
  max: z.number(),
  median: z.number(),
  currency: z.string().nullable(),
  sampleSize: z.number(),
});
export type ShoppingPriceStats = z.infer<typeof priceStatsSchema>;
const priceStatsCodec = jsonCodec(priceStatsSchema);

// Writes use plain JSON.stringify (matches contentJsonCodecs' convention);
// these decode-and-default helpers are for reads, so a row written before a
// schema tightening degrades gracefully instead of failing the whole read.
export function decodeShoppingListings(raw: string): ShoppingListing[] {
  const parsed = shoppingListingsCodec.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function decodeShoppingPriceStats(
  raw: string | null,
): ShoppingPriceStats | null {
  if (raw == null) return null;
  const parsed = priceStatsCodec.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The domain overview's result is an intentionally raw passthrough object
 *  (see merchant.ts) — decode defensively into a plain record, never throw. */
export function decodeRawJsonRecord(raw: string | null): JsonRecord | null {
  if (raw == null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return null;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- raw passthrough of whatever DataForSEO returned (see merchant.ts); the parsed value is only proven "object" here.
    return parsed as JsonRecord;
  } catch {
    return null;
  }
}
