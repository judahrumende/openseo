import { z } from "zod";
import { ContentBriefService } from "@/server/features/content/services/ContentBriefService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { resolveLabsMarket } from "@/shared/keyword-locations";
import {
  assertLabsLocationCode,
  assertLanguageForLocation,
} from "@/server/lib/market";
import {
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  targetKeyword: z
    .string()
    .min(1)
    .max(200)
    .describe("Target keyword/topic to write the article for."),
  topicResearchRunId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional runId from a prior research_content_topics call. When given, entities and questions are drawn from that research instead of a fresh SERP lookup.",
    ),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

const outlineItemSchema = z
  .object({
    level: z.enum(["h2", "h3"]),
    heading: z.string(),
    notes: z.string().optional(),
  })
  .passthrough();

export const generateContentBriefTool = {
  name: "generate_content_brief",
  config: {
    title: "Generate content brief",
    description:
      "Generates an SEO content brief for a target keyword: title options, a target word count derived from live competitor page word counts, an H2/H3 outline, entities/related terms to cover, and a target reading level. Requires OPENROUTER_API_KEY to be configured for this deployment — a missing key fails with error code AI_FEATURE_NOT_CONFIGURED; tell the user to set that up rather than retrying. Charges credits for one SERP lookup (competitor research) plus the LLM generation cost. Call research_content_topics first and pass its runId here when you want the brief grounded in a broader keyword cluster rather than a single keyword's SERP.",
    inputSchema,
    outputSchema: {
      briefId: z.string(),
      targetKeyword: z.string(),
      titleOptions: z.array(z.string()),
      targetWordCount: z.number().nullable(),
      competitorAvgWordCount: z.number().nullable(),
      competitorSampleSize: z.number(),
      outline: z.array(outlineItemSchema),
      entities: z.array(z.string()),
      targetReadingLevel: z.string().nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const { locationCode, languageCode } = resolveLabsMarket(
      args,
      context.project,
    );
    assertLabsLocationCode(locationCode);
    assertLanguageForLocation(locationCode, languageCode);

    const result = await ContentBriefService.generate(
      {
        projectId: args.projectId,
        targetKeyword: args.targetKeyword,
        topicResearchRunId: args.topicResearchRunId,
        locationCode,
        languageCode,
        userId: context.auth.userId,
      },
      context.billing,
    );

    const text = [
      `Content brief for "${result.targetKeyword}" (brief ${result.briefId})`,
      `Target length: ~${result.targetWordCount ?? "unknown"} words (from ${result.competitorSampleSize} competitor pages, avg ${result.competitorAvgWordCount ?? "unknown"}).`,
      `Reading level: ${result.targetReadingLevel ?? "unknown"}`,
      "",
      "Title options:",
      ...result.titleOptions.map((title) => `- ${title}`),
      "",
      "Outline:",
      ...result.outline.map(
        (item) =>
          `${item.level === "h2" ? "##" : "###"} ${item.heading}${item.notes ? ` — ${item.notes}` : ""}`,
      ),
      "",
      `Entities to cover: ${result.entities.join(", ")}`,
    ].join("\n");

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/content/briefs/${result.briefId}`,
      ),
      structuredContent: result,
    });
  }),
};
