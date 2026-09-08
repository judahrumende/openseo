import { z } from "zod";
import { jsonCodec, type JsonRecord } from "@/shared/json";

// JSON column codecs for the advertising feature's leaf-list columns (see
// src/db/advertising.schema.ts) — same approach as
// src/server/features/content/contentJsonCodecs.ts.

const stringListCodec = jsonCodec(z.array(z.string()));

export function decodeStringList(raw: string): string[] {
  const parsed = stringListCodec.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** advertisersJson/adsJson store raw passthrough provider rows (see
 *  ads-transparency.ts) — decode defensively into a plain array, never throw. */
export function decodeRawJsonArray(raw: string): JsonRecord[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is JsonRecord => item !== null && typeof item === "object",
    );
  } catch {
    return [];
  }
}

const adCopyVariantSchema = z.object({
  headline: z.string().min(1),
  description: z.string().min(1),
});
export type AdCopyVariant = z.infer<typeof adCopyVariantSchema>;
const adCopyVariantsCodec = jsonCodec(z.array(adCopyVariantSchema));

export function decodeAdCopyVariants(raw: string): AdCopyVariant[] {
  const parsed = adCopyVariantsCodec.safeParse(raw);
  return parsed.success ? parsed.data : [];
}
