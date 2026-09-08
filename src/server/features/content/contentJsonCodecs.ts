import { z } from "zod";
import { jsonCodec } from "@/shared/json";

// JSON column codecs for the content feature's leaf-list columns (see
// src/db/content.schema.ts). Each pairs the stored shape with a Zod schema so
// reads are validated the same way audit.schema.ts validates `config`. Only
// the types and decode*() helpers are consumed outside this file — the
// schemas/codecs themselves stay module-private.

const clusterKeywordSchema = z.object({
  keyword: z.string(),
  searchVolume: z.number().nullable(),
  cpc: z.number().nullable(),
  keywordDifficulty: z.number().nullable(),
});
export type ClusterKeyword = z.infer<typeof clusterKeywordSchema>;
const clusterKeywordsCodec = jsonCodec(z.array(clusterKeywordSchema));

const stringListCodec = jsonCodec(z.array(z.string()));

const briefOutlineItemSchema = z.object({
  level: z.enum(["h2", "h3"]),
  heading: z.string(),
  notes: z.string().optional(),
});
export type BriefOutlineItem = z.infer<typeof briefOutlineItemSchema>;
const briefOutlineCodec = jsonCodec(z.array(briefOutlineItemSchema));

const pageFlagSchema = z.enum([
  "thin_content",
  "missing_keyword_in_title",
  "missing_keyword_in_h1",
  "declining_performance",
  "fetch_failed",
]);
export type PageFlag = z.infer<typeof pageFlagSchema>;
const pageFlagsCodec = jsonCodec(z.array(pageFlagSchema));

// Writes use plain JSON.stringify (matches src/server/features/keywords'
// monthlySearchesJson convention); these decode-and-default helpers are for
// reads, so a row written before a schema tightening degrades to an empty
// list instead of failing the whole read.
export function decodeStringList(raw: string): string[] {
  const parsed = stringListCodec.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function decodeClusterKeywords(raw: string): ClusterKeyword[] {
  const parsed = clusterKeywordsCodec.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function decodeBriefOutline(raw: string): BriefOutlineItem[] {
  const parsed = briefOutlineCodec.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function decodePageFlags(raw: string): PageFlag[] {
  const parsed = pageFlagsCodec.safeParse(raw);
  return parsed.success ? parsed.data : [];
}
