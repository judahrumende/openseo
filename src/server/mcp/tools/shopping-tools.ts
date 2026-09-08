import { z } from "zod";
import {
  DEFAULT_PRODUCTS_DEPTH,
  MAX_PRODUCTS_DEPTH,
  ShoppingProductsService,
} from "@/server/features/shopping/services/ShoppingProductsService";
import { ShoppingOverviewService } from "@/server/features/shopping/services/ShoppingOverviewService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { resolveMarket } from "@/shared/keyword-locations";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { AppError } from "@/server/lib/errors";
import {
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";

// ---------------------------------------------------------------------------
// research_shopping_products
// ---------------------------------------------------------------------------

type ShoppingListingRow = {
  position: number | null;
  title: string | null;
  sellerDomain: string | null;
  price: number | null;
  currency: string | null;
  isProjectDomain: boolean;
};

const LISTING_COLUMNS: McpTableColumn<ShoppingListingRow>[] = [
  { header: "#", value: (row) => row.position },
  { header: "title", value: (row) => row.title },
  {
    header: "seller",
    value: (row) =>
      row.isProjectDomain ? `${row.sellerDomain} (you)` : row.sellerDomain,
  },
  {
    header: "price",
    value: (row) =>
      row.price != null ? `${row.currency ?? ""} ${row.price}`.trim() : null,
  },
];

const researchShoppingProductsInputSchema = {
  projectId: projectIdSchema,
  keyword: z
    .string()
    .min(1)
    .max(200)
    .describe("Product search keyword, e.g. 'sim racing wheel'.")
    .optional(),
  runId: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Resume a previous call that returned status "processing" — pass the runId it returned instead of a new keyword. Resuming charges no extra credits.',
    ),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
  depth: z
    .number()
    .int()
    .min(10)
    .max(MAX_PRODUCTS_DEPTH)
    .optional()
    .describe(
      `Number of listings to collect (10-${MAX_PRODUCTS_DEPTH}). Defaults to ${DEFAULT_PRODUCTS_DEPTH}. Higher depth returns more listings at higher DataForSEO cost — the exact per-listing cost is not documented here, start low and raise it only if you need deeper coverage.`,
    ),
} as const;

type ResearchShoppingProductsArgs = z.infer<
  z.ZodObject<typeof researchShoppingProductsInputSchema>
>;

export const researchShoppingProductsTool = {
  name: "research_shopping_products",
  config: {
    title: "Research Google Shopping products",
    description:
      "Finds current Google Shopping listings for a product keyword: who's visible, price positioning (min/max/median across competitor listings), and whether the project's own domain appears and at what position. Backed by DataForSEO's Merchant API, which crawls asynchronously — most calls complete within this one request, but a large or slow crawl can return status \"processing\" with a runId; call this tool again with that runId (no new keyword) to resume for free. Charges DataForSEO credits on the initial call only, not on a resume. Use get_shopping_domain_overview instead when you want a domain-level visibility snapshot rather than a keyword-level listing comparison.",
    inputSchema: researchShoppingProductsInputSchema,
    outputSchema: {
      runId: z.string(),
      status: z.enum(["processing", "completed", "failed"]),
      listings: z.array(looseObjectOutputSchema),
      priceStats: looseObjectOutputSchema.nullable(),
      errorMessage: z.string().nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: ResearchShoppingProductsArgs, context) => {
      if (!args.keyword && !args.runId) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Pass either keyword (to start a new search) or runId (to resume one).",
        );
      }

      const result = args.runId
        ? await ShoppingProductsService.resume(
            args.runId,
            args.projectId,
            context.project.domain ?? null,
          )
        : await ShoppingProductsService.search(
            {
              projectId: args.projectId,
              keyword: args.keyword!,
              depth: args.depth,
              projectDomain: context.project.domain ?? null,
              userId: context.auth.userId,
              ...resolveMarket(args, context.project),
            },
            context.billing,
          );

      const text =
        result.status === "processing"
          ? `Still collecting Shopping results. Call research_shopping_products again with runId "${result.runId}" in 30-60 seconds — resuming charges no extra credits.`
          : result.status === "failed"
            ? `Shopping search failed: ${result.errorMessage ?? "unknown error"}`
            : [
                `Google Shopping results for "${result.keyword}" (run ${result.runId}): ${result.listings.length} listings.`,
                result.priceStats
                  ? `Price range: ${result.priceStats.currency ?? ""} ${result.priceStats.min}-${result.priceStats.max}, median ${result.priceStats.median} (${result.priceStats.sampleSize} priced listings).`
                  : "No priced listings to compare.",
                result.listings.some((l) => l.isProjectDomain)
                  ? "Your domain appears in these results (marked 'you' below)."
                  : "Your domain does not appear in these results.",
                "",
                formatMcpTable(result.listings, LISTING_COLUMNS),
              ].join("\n");

      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/shopping`,
        ),
        structuredContent: result,
      });
    },
  ),
};

// ---------------------------------------------------------------------------
// get_shopping_domain_overview
// ---------------------------------------------------------------------------

const getShoppingDomainOverviewInputSchema = {
  projectId: projectIdSchema,
  targetDomain: z
    .string()
    .min(1)
    .max(253)
    .optional()
    .describe(
      "Domain to check (e.g. 'example.com'). Defaults to the project's own domain.",
    ),
  runId: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Resume a previous call that returned status "processing" — pass the runId it returned instead of targetDomain. Resuming charges no extra credits.',
    ),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type GetShoppingDomainOverviewArgs = z.infer<
  z.ZodObject<typeof getShoppingDomainOverviewInputSchema>
>;

export const getShoppingDomainOverviewTool = {
  name: "get_shopping_domain_overview",
  config: {
    title: "Get Google Shopping domain overview",
    description:
      'Aggregate Google Shopping visibility snapshot for one domain (DataForSEO Merchant API). This endpoint\'s exact response shape was not verified against a live call while this tool was built, so the result is returned as an unshaped object — read it for whatever fields DataForSEO actually sends rather than assuming specific field names. For a reviewed, normalized keyword-level comparison (listings, price positioning, project-domain match), prefer research_shopping_products instead. Same async pattern: a slow crawl can return status "processing" with a runId to resume for free. Charges DataForSEO credits on the initial call only.',
    inputSchema: getShoppingDomainOverviewInputSchema,
    outputSchema: {
      runId: z.string(),
      status: z.enum(["processing", "completed", "failed"]),
      overview: looseObjectOutputSchema.nullable(),
      errorMessage: z.string().nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: GetShoppingDomainOverviewArgs, context) => {
      let result;
      if (args.runId) {
        result = await ShoppingOverviewService.resume(
          args.runId,
          args.projectId,
        );
      } else {
        const targetDomain = args.targetDomain ?? context.project.domain;
        if (!targetDomain) {
          throw new AppError(
            "VALIDATION_ERROR",
            "This project has no domain set — pass targetDomain explicitly.",
          );
        }
        result = await ShoppingOverviewService.getOverview(
          {
            projectId: args.projectId,
            targetDomain,
            userId: context.auth.userId,
            ...resolveMarket(args, context.project),
          },
          context.billing,
        );
      }

      const text =
        result.status === "processing"
          ? `Still collecting the Shopping overview. Call get_shopping_domain_overview again with runId "${result.runId}" in 30-60 seconds — resuming charges no extra credits.`
          : result.status === "failed"
            ? `Shopping overview failed: ${result.errorMessage ?? "unknown error"}`
            : `Shopping overview for ${result.targetDomain} (run ${result.runId}):\n${JSON.stringify(result.overview, null, 2)}`;

      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/shopping/domain`,
        ),
        structuredContent: result,
      });
    },
  ),
};
