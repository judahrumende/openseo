import { z } from "zod";
import {
  AdvertisingResearchService,
  extractAdvertiserId,
  MAX_ADVERTISER_IDS_PER_SEARCH,
} from "@/server/features/advertising/services/AdvertisingResearchService";
import { AdCopyGenerationService } from "@/server/features/advertising/services/AdCopyGenerationService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { resolveMarket } from "@/shared/keyword-locations";
import {
  formatMcpTable,
  readPath,
  type McpTableColumn,
} from "@/server/mcp/table";
import {
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";
import type { JsonRecord } from "@/shared/json";

// ---------------------------------------------------------------------------
// research_ad_advertisers
// ---------------------------------------------------------------------------

const ADVERTISER_COLUMNS: McpTableColumn<JsonRecord>[] = [
  {
    header: "advertiser_id",
    value: (row) => extractAdvertiserId(row),
  },
  {
    header: "name",
    value: (row) =>
      readPath(row, "title") ??
      readPath(row, "advertiser_name") ??
      readPath(row, "name"),
  },
  {
    header: "domain",
    value: (row) => readPath(row, "domain") ?? readPath(row, "website"),
  },
  { header: "verified", value: (row) => readPath(row, "verified") },
];

const researchAdAdvertisersInputSchema = {
  projectId: projectIdSchema,
  keyword: z
    .string()
    .min(1)
    .max(200)
    .describe("Keyword to find advertisers for, e.g. 'sim racing pedals'."),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type ResearchAdAdvertisersArgs = z.infer<
  z.ZodObject<typeof researchAdAdvertisersInputSchema>
>;

export const researchAdAdvertisersTool = {
  name: "research_ad_advertisers",
  config: {
    title: "Research Google Ads advertisers",
    description:
      "Finds advertisers running Google Ads on a keyword, via Google's Ads Transparency Center (DataForSEO SERP API). Returns advertiser id, name, domain, and verification status where DataForSEO provides them — the exact field set was not verified against a live call while this tool was built, so treat unfamiliar fields as informational. Returns a searchId — pass the advertiser ids you care about, plus this searchId, to get_ad_copy to pull those advertisers' actual running ad text. Use this before get_ad_copy, not instead of it: this tool alone does not return ad creative. Charges DataForSEO credits. For organic (non-paid) competitors on this keyword, use get_serp_results instead.",
    inputSchema: researchAdAdvertisersInputSchema,
    outputSchema: {
      searchId: z.string(),
      advertisers: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: ResearchAdAdvertisersArgs, context) => {
      const result = await AdvertisingResearchService.searchAdvertisers(
        {
          projectId: args.projectId,
          keyword: args.keyword,
          userId: context.auth.userId,
          ...resolveMarket(args, context.project),
        },
        context.billing,
      );

      const text =
        result.advertisers.length === 0
          ? `No advertisers found running Google Ads on "${args.keyword}" in this market.`
          : [
              `${result.advertisers.length} advertiser(s) found for "${args.keyword}" (search ${result.searchId}):`,
              formatMcpTable(result.advertisers, ADVERTISER_COLUMNS),
              "",
              "Pass the advertiser_id values above to get_ad_copy (with advertiserSearchId set to this search's id) to see their actual ad text.",
            ].join("\n");

      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/advertising`,
        ),
        structuredContent: result,
      });
    },
  ),
};

// ---------------------------------------------------------------------------
// get_ad_copy
// ---------------------------------------------------------------------------

const AD_COPY_COLUMNS: McpTableColumn<JsonRecord>[] = [
  {
    header: "title",
    value: (row) => readPath(row, "title") ?? readPath(row, "headline"),
  },
  { header: "description", value: (row) => readPath(row, "description") },
  {
    header: "domain",
    value: (row) => readPath(row, "domain") ?? readPath(row, "url"),
  },
];

const getAdCopyInputSchema = {
  projectId: projectIdSchema,
  advertiserIds: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_ADVERTISER_IDS_PER_SEARCH)
    .describe(
      `Advertiser ids from research_ad_advertisers (1-${MAX_ADVERTISER_IDS_PER_SEARCH}).`,
    ),
  advertiserSearchId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The searchId from the research_ad_advertisers call these ids came from, so the two runs stay linked.",
    ),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type GetAdCopyArgs = z.infer<z.ZodObject<typeof getAdCopyInputSchema>>;

export const getAdCopyTool = {
  name: "get_ad_copy",
  config: {
    title: "Get advertiser ad copy",
    description:
      "Pulls the actual running Google Ads creative (headline/description text where DataForSEO returns it) for a set of advertiser ids, via Google's Ads Transparency Center. Get advertiser ids from research_ad_advertisers first. Returns a searchId — pass it as inspirationSearchId to generate_ad_copy to draft your own copy using this as inspiration. Charges DataForSEO credits.",
    inputSchema: getAdCopyInputSchema,
    outputSchema: {
      searchId: z.string(),
      advertiserIds: z.array(z.string()),
      ads: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GetAdCopyArgs, context) => {
    const result = await AdvertisingResearchService.searchAdCopy(
      {
        projectId: args.projectId,
        advertiserIds: args.advertiserIds,
        advertiserSearchId: args.advertiserSearchId,
        userId: context.auth.userId,
        ...resolveMarket(args, context.project),
      },
      context.billing,
    );

    const text =
      result.ads.length === 0
        ? "No ad creative returned for those advertiser ids."
        : [
            `${result.ads.length} ad(s) found (search ${result.searchId}):`,
            formatMcpTable(result.ads, AD_COPY_COLUMNS),
            "",
            "Pass this searchId as inspirationSearchId to generate_ad_copy to draft your own variants.",
          ].join("\n");

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/advertising`,
      ),
      structuredContent: result,
    });
  }),
};

// ---------------------------------------------------------------------------
// generate_ad_copy
// ---------------------------------------------------------------------------

const generateAdCopyInputSchema = {
  projectId: projectIdSchema,
  targetKeyword: z
    .string()
    .min(1)
    .max(200)
    .describe("Target keyword/topic to write ad copy for."),
  inspirationSearchId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional searchId from a prior get_ad_copy call. When given, competitor ad copy from that search is used as inspiration.",
    ),
} as const;

type GenerateAdCopyArgs = z.infer<
  z.ZodObject<typeof generateAdCopyInputSchema>
>;

export const generateAdCopyTool = {
  name: "generate_ad_copy",
  config: {
    title: "Generate AI ad copy",
    description:
      "Drafts 3-5 Google Ads-style headline (<=30 chars) / description (<=90 chars) variants for a target keyword, optionally inspired by real competitor ad copy from a prior get_ad_copy call. Requires OPENROUTER_API_KEY to be configured for this deployment — a missing key fails with error code AI_FEATURE_NOT_CONFIGURED; tell the user to set that up rather than retrying. Charges credits for the LLM generation only (no DataForSEO cost). This is separate from and does not call research_ad_advertisers/get_ad_copy — run those first if you want real competitor copy as inspiration.",
    inputSchema: generateAdCopyInputSchema,
    outputSchema: {
      draftId: z.string(),
      targetKeyword: z.string(),
      variants: z.array(
        z.object({ headline: z.string(), description: z.string() }),
      ),
      modelUsed: z.string().nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: GenerateAdCopyArgs, context) => {
    const result = await AdCopyGenerationService.generate(
      {
        projectId: args.projectId,
        targetKeyword: args.targetKeyword,
        inspirationSearchId: args.inspirationSearchId,
        userId: context.auth.userId,
      },
      context.billing,
    );

    const text = [
      `Ad copy for "${result.targetKeyword}" (draft ${result.draftId}):`,
      ...result.variants.map(
        (variant, index) =>
          `${index + 1}. ${variant.headline} — ${variant.description}`,
      ),
    ].join("\n");

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/advertising/ad-copy`,
      ),
      structuredContent: result,
    });
  }),
};
