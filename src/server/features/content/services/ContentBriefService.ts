import { z } from "zod";
import { generateObject } from "ai";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  assertUsageCreditsAvailable,
  getOrCreateOrganizationCustomer,
  trackUsageCreditSpend,
} from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { SerpLiveItem } from "@/server/lib/dataforseo/serp";
import { openRouterCostUsd } from "@/server/lib/chatAgent";
import { buildChatAgentModel } from "@/server/lib/openrouter";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import { AppError } from "@/server/lib/errors";
import { ContentRepository } from "@/server/features/content/repositories/ContentRepository";
import { TopicResearchService } from "@/server/features/content/services/TopicResearchService";
import {
  fetchContentPages,
  type ContentPageFetchResult,
} from "@/server/features/content/services/contentPageFetch";
import {
  decodeBriefOutline,
  decodeStringList,
  type BriefOutlineItem,
} from "@/server/features/content/contentJsonCodecs";
import {
  extractPeopleAlsoAsk,
  extractRelatedSearches,
} from "@/server/features/content/services/serpQuestionExtraction";

const COMPETITOR_SERP_DEPTH = 10;
const MAX_COMPETITOR_PAGES = 5;
const WORD_COUNT_HEADROOM = 1.1; // aim ~10% past the competitor average
const WORD_COUNT_ROUNDING = 50;

const OPENROUTER_KEY_MISSING_MESSAGE =
  "This feature needs an OpenRouter API key. Set OPENROUTER_API_KEY for this deployment and try again.";

const briefLlmSchema = z.object({
  titleOptions: z
    .array(z.string().min(3).max(160))
    .min(3)
    .max(6)
    .describe("Candidate H1/title tag options for this article."),
  outline: z
    .array(
      z.object({
        level: z.enum(["h2", "h3"]),
        heading: z.string().min(1).max(200),
        notes: z
          .string()
          .max(400)
          .optional()
          .describe("What this section should cover, in one sentence."),
      }),
    )
    .min(3)
    .max(20)
    .describe("H2/H3 outline for the article body, in reading order."),
  entitiesToInclude: z
    .array(z.string().min(1).max(80))
    .min(3)
    .max(20)
    .describe(
      "Entities, related terms, and concepts the article should mention.",
    ),
  targetReadingLevel: z
    .string()
    .min(1)
    .max(80)
    .describe(
      'Target reading level for the audience, e.g. "Grade 7-8 (broad consumer audience)".',
    ),
});

type ContentBriefLlmOutput = z.infer<typeof briefLlmSchema>;

type ContentBriefResult = {
  briefId: string;
  targetKeyword: string;
  locationCode: number;
  languageCode: string;
  titleOptions: string[];
  targetWordCount: number | null;
  competitorAvgWordCount: number | null;
  competitorSampleSize: number;
  outline: BriefOutlineItem[];
  entities: string[];
  targetReadingLevel: string | null;
  modelUsed: string | null;
  topicResearchRunId: string | null;
  createdAt: string;
};

function isEnabled(): Promise<boolean> {
  return getOptionalEnvValue("OPENROUTER_API_KEY").then(Boolean);
}

function roundToNearest(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

/** Keeps at most one page per registrable-ish host so one competitor with
 *  several ranking pages doesn't dominate the word-count average. */
function dedupeByHost(items: SerpLiveItem[]): SerpLiveItem[] {
  const seenHosts = new Set<string>();
  const result: SerpLiveItem[] = [];
  for (const item of items) {
    if (!item.url) continue;
    let host: string;
    try {
      host = new URL(item.url).hostname;
    } catch {
      continue;
    }
    if (seenHosts.has(host)) continue;
    seenHosts.add(host);
    result.push(item);
  }
  return result;
}

async function gatherCompetitorSignal(input: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  billingCustomer: BillingCustomerContext;
}) {
  const dataforseo = createDataforseoClient(input.billingCustomer);
  const serpItems = await dataforseo.serp.live({
    keyword: input.keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    depth: COMPETITOR_SERP_DEPTH,
  });

  const organic = serpItems.filter((item) => item.type === "organic");
  const competitors = dedupeByHost(organic).slice(0, MAX_COMPETITOR_PAGES);
  const pages: ContentPageFetchResult[] =
    competitors.length > 0
      ? await fetchContentPages(
          competitors.map((item) => item.url ?? "").filter(Boolean),
        )
      : [];
  const wordCounts = pages
    .map((page) => page.wordCount)
    .filter((count): count is number => count != null);

  const competitorAvgWordCount =
    wordCounts.length > 0
      ? Math.round(
          wordCounts.reduce((sum, count) => sum + count, 0) / wordCounts.length,
        )
      : null;
  const targetWordCount =
    competitorAvgWordCount != null
      ? roundToNearest(
          competitorAvgWordCount * WORD_COUNT_HEADROOM,
          WORD_COUNT_ROUNDING,
        )
      : null;

  return {
    competitorAvgWordCount,
    targetWordCount,
    competitorSampleSize: wordCounts.length,
    competitorTitles: competitors
      .map((item) => item.title)
      .filter((t): t is string => Boolean(t)),
    questions: extractPeopleAlsoAsk(serpItems),
    relatedSearches: extractRelatedSearches(serpItems),
  };
}

function buildPrompt(input: {
  targetKeyword: string;
  locationCode: number;
  languageCode: string;
  targetWordCount: number | null;
  competitorTitles: string[];
  entityCandidates: string[];
  questions: string[];
}): string {
  const lines = [
    `Write a content brief for an SEO article targeting the keyword "${input.targetKeyword}".`,
    `Market: location code ${input.locationCode}, language ${input.languageCode}.`,
  ];
  if (input.targetWordCount != null) {
    lines.push(
      `Competitor research suggests a target length of about ${input.targetWordCount} words — size the outline accordingly.`,
    );
  }
  if (input.competitorTitles.length > 0) {
    lines.push(
      "Top-ranking competitor titles for this keyword:",
      ...input.competitorTitles.map((title) => `- ${title}`),
    );
  }
  if (input.entityCandidates.length > 0) {
    lines.push(
      "Related keywords / subtopics to draw entities and outline sections from:",
      ...input.entityCandidates.slice(0, 40).map((term) => `- ${term}`),
    );
  }
  if (input.questions.length > 0) {
    lines.push(
      "Questions real searchers ask about this topic (consider answering these in the outline):",
      ...input.questions.map((question) => `- ${question}`),
    );
  }
  lines.push(
    "Propose 3-5 distinct title options, an H2/H3 outline that thoroughly covers the topic and the questions above, the entities/related terms the article should mention, and a target reading level appropriate for a general consumer audience searching this term.",
  );
  return lines.join("\n");
}

async function generateBriefContent(prompt: string): Promise<{
  output: ContentBriefLlmOutput;
  providerMetadata: unknown;
  modelId: string;
}> {
  const apiKey = await getOptionalEnvValue("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new AppError(
      "AI_FEATURE_NOT_CONFIGURED",
      OPENROUTER_KEY_MISSING_MESSAGE,
    );
  }
  const modelId = await getOptionalEnvValue("OPENROUTER_MODEL");
  const model = buildChatAgentModel(apiKey, modelId);
  const result = await generateObject({
    model,
    schema: briefLlmSchema,
    prompt,
  });
  return {
    output: result.object,
    providerMetadata: result.providerMetadata,
    modelId: model.modelId,
  };
}

/** Gates and meters the LLM spend the same way DataForSEO calls are metered
 *  (src/server/lib/dataforseo/client.ts): self-host is ungated, hosted mode
 *  checks and then draws down the shared credit pool. */
async function withLlmMetering<T>(
  billingCustomer: BillingCustomerContext,
  execute: () => Promise<{ result: T; providerMetadata: unknown }>,
): Promise<T> {
  const hosted = await isHostedServerAuthMode();
  if (!hosted) {
    const { result } = await execute();
    return result;
  }
  const customer = await getOrCreateOrganizationCustomer(billingCustomer);
  const { monthlyRemaining } = await assertUsageCreditsAvailable(customer.id);
  const { result, providerMetadata } = await execute();
  await trackUsageCreditSpend({
    customer: billingCustomer,
    customerId: customer.id,
    creditFeature: "agent",
    costUsd: openRouterCostUsd(providerMetadata),
    monthlyRemaining,
    properties: { provider: "openrouter", feature: "content_brief" },
  });
  return result;
}

async function generate(
  input: {
    projectId: string;
    targetKeyword: string;
    topicResearchRunId?: string;
    locationCode: number;
    languageCode: string;
    userId: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<ContentBriefResult> {
  if (!(await isEnabled())) {
    throw new AppError(
      "AI_FEATURE_NOT_CONFIGURED",
      OPENROUTER_KEY_MISSING_MESSAGE,
    );
  }

  let seededRun: Awaited<ReturnType<typeof TopicResearchService.getRun>> = null;
  if (input.topicResearchRunId) {
    seededRun = await TopicResearchService.getRun(
      input.topicResearchRunId,
      input.projectId,
    );
    if (!seededRun) {
      throw new AppError(
        "NOT_FOUND",
        "Topic research run not found for this project",
      );
    }
  }

  const competitor = await gatherCompetitorSignal({
    keyword: input.targetKeyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    billingCustomer,
  });

  const entityCandidates = seededRun
    ? seededRun.clusters.flatMap((cluster) => [
        cluster.label,
        ...cluster.keywords.slice(0, 6).map((k) => k.keyword),
      ])
    : competitor.relatedSearches;
  const questions = seededRun ? seededRun.questions : competitor.questions;

  const prompt = buildPrompt({
    targetKeyword: input.targetKeyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    targetWordCount: competitor.targetWordCount,
    competitorTitles: competitor.competitorTitles,
    entityCandidates,
    questions,
  });

  const { output, modelId } = await withLlmMetering(billingCustomer, () =>
    generateBriefContent(prompt).then(
      ({ output: obj, providerMetadata, modelId: model }) => ({
        result: { output: obj, modelId: model },
        providerMetadata,
      }),
    ),
  );

  const briefId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await ContentRepository.createBrief({
    id: briefId,
    projectId: input.projectId,
    topicResearchRunId: seededRun?.runId ?? null,
    targetKeyword: input.targetKeyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    titleOptionsJson: JSON.stringify(output.titleOptions),
    targetWordCount: competitor.targetWordCount,
    competitorAvgWordCount: competitor.competitorAvgWordCount,
    competitorSampleSize: competitor.competitorSampleSize,
    outlineJson: JSON.stringify(output.outline),
    entitiesJson: JSON.stringify(output.entitiesToInclude),
    targetReadingLevel: output.targetReadingLevel,
    modelUsed: modelId,
    createdByUserId: input.userId,
  });

  return {
    briefId,
    targetKeyword: input.targetKeyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    titleOptions: output.titleOptions,
    targetWordCount: competitor.targetWordCount,
    competitorAvgWordCount: competitor.competitorAvgWordCount,
    competitorSampleSize: competitor.competitorSampleSize,
    outline: output.outline,
    entities: output.entitiesToInclude,
    targetReadingLevel: output.targetReadingLevel,
    modelUsed: modelId,
    topicResearchRunId: seededRun?.runId ?? null,
    createdAt,
  };
}

async function getBrief(
  briefId: string,
  projectId: string,
): Promise<ContentBriefResult | null> {
  const row = await ContentRepository.getBrief(briefId, projectId);
  if (!row) return null;
  return {
    briefId: row.id,
    targetKeyword: row.targetKeyword,
    locationCode: row.locationCode,
    languageCode: row.languageCode,
    titleOptions: decodeStringList(row.titleOptionsJson),
    targetWordCount: row.targetWordCount,
    competitorAvgWordCount: row.competitorAvgWordCount,
    competitorSampleSize: row.competitorSampleSize,
    outline: decodeBriefOutline(row.outlineJson),
    entities: decodeStringList(row.entitiesJson),
    targetReadingLevel: row.targetReadingLevel,
    modelUsed: row.modelUsed,
    topicResearchRunId: row.topicResearchRunId,
    createdAt: row.createdAt,
  };
}

type ContentBriefSummary = {
  briefId: string;
  targetKeyword: string;
  createdAt: string;
};

async function listBriefs(projectId: string): Promise<ContentBriefSummary[]> {
  const rows = await ContentRepository.listBriefs(projectId);
  return rows.map((row) => ({
    briefId: row.id,
    targetKeyword: row.targetKeyword,
    createdAt: row.createdAt,
  }));
}

export const ContentBriefService = {
  isEnabled,
  generate,
  getBrief,
  listBriefs,
};
