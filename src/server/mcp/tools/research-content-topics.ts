import { z } from "zod";
import { TopicResearchService } from "@/server/features/content/services/TopicResearchService";
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
  seedKeyword: z
    .string()
    .min(1)
    .max(200)
    .describe("Seed keyword or topic to research."),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

const clusterOutputSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    intent: z.string().nullable(),
    totalSearchVolume: z.number().nullable(),
    keywords: z.array(
      z.object({
        keyword: z.string(),
        searchVolume: z.number().nullable(),
        cpc: z.number().nullable(),
        keywordDifficulty: z.number().nullable(),
      }),
    ),
  })
  .passthrough();

export const researchContentTopicsTool = {
  name: "research_content_topics",
  config: {
    title: "Research content topics",
    description:
      "Given a seed keyword, returns subtopic keyword clusters grouped by shared theme/intent (each with a combined search-volume signal), a People-Also-Ask question list, and Google's related searches. Use this to plan a content pillar or find angles before writing. Pass the returned runId to generate_content_brief's topicResearchRunId to seed a brief from this research instead of a fresh lookup. Charges credits (~30-100, similar to research_keywords) for one keyword-ideas pull plus one SERP scan.",
    inputSchema,
    outputSchema: {
      runId: z.string(),
      seedKeyword: z.string(),
      questions: z.array(z.string()),
      relatedSearches: z.array(z.string()),
      clusters: z.array(clusterOutputSchema),
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

    const result = await TopicResearchService.research(
      {
        projectId: args.projectId,
        seedKeyword: args.seedKeyword,
        locationCode,
        languageCode,
        userId: context.auth.userId,
      },
      context.billing,
    );

    const text = [
      `Topic research for "${result.seedKeyword}" (run ${result.runId})`,
      `${result.clusters.length} subtopic clusters, ${result.questions.length} PAA questions, ${result.relatedSearches.length} related searches.`,
      "",
      ...result.clusters.slice(0, 15).map(
        (cluster) =>
          `- ${cluster.label} (${cluster.intent ?? "intent unknown"}, ~${cluster.totalSearchVolume ?? "?"} combined volume): ${cluster.keywords
            .slice(0, 5)
            .map((k) => k.keyword)
            .join(", ")}`,
      ),
      result.questions.length > 0
        ? `\nTop questions: ${result.questions.slice(0, 8).join(" | ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/content/topics`,
        { seedKeyword: args.seedKeyword, runId: result.runId },
      ),
      structuredContent: result,
    });
  }),
};
