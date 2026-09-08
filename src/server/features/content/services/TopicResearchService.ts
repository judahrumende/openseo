import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { ContentRepository } from "@/server/features/content/repositories/ContentRepository";
import {
  clusterKeywordIdeas,
  type KeywordIdea,
  type TopicCluster,
} from "@/server/features/content/services/topicClustering";
import {
  extractPeopleAlsoAsk,
  extractRelatedSearches,
} from "@/server/features/content/services/serpQuestionExtraction";
import {
  decodeClusterKeywords,
  decodeStringList,
} from "@/server/features/content/contentJsonCodecs";

// Enough related-keyword volume to cluster meaningfully without paying for an
// exhaustive pull; research_keywords' default (150) plus headroom.
const KEYWORD_IDEAS_LIMIT = 300;
// Shallow SERP scan: only used to read the PAA/related-searches feature
// blocks, not to judge rankings, so a full 20-result crawl isn't worth the
// extra page fetch.
const QUESTIONS_SERP_DEPTH = 10;

type TopicClusterResult = TopicCluster & { id: string };

type TopicResearchResult = {
  runId: string;
  seedKeyword: string;
  locationCode: number;
  languageCode: string;
  questions: string[];
  relatedSearches: string[];
  clusters: TopicClusterResult[];
  createdAt: string;
};

async function research(
  input: {
    projectId: string;
    seedKeyword: string;
    locationCode: number;
    languageCode: string;
    userId: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<TopicResearchResult> {
  const dataforseo = createDataforseoClient(billingCustomer);

  const [ideas, serpItems] = await Promise.all([
    dataforseo.keywords.ideas({
      keyword: input.seedKeyword,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      limit: KEYWORD_IDEAS_LIMIT,
    }),
    dataforseo.serp.live({
      keyword: input.seedKeyword,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      depth: QUESTIONS_SERP_DEPTH,
    }),
  ]);

  const keywordIdeas: KeywordIdea[] = ideas.flatMap((item) => {
    const keyword = item.keyword;
    if (!keyword) return [];
    return [
      {
        keyword,
        searchVolume: item.keyword_info?.search_volume ?? null,
        cpc: item.keyword_info?.cpc ?? null,
        keywordDifficulty: item.keyword_properties?.keyword_difficulty ?? null,
        intent: item.search_intent_info?.main_intent ?? null,
      },
    ];
  });

  const clusters = clusterKeywordIdeas(input.seedKeyword, keywordIdeas);
  const questions = extractPeopleAlsoAsk(serpItems);
  const relatedSearches = extractRelatedSearches(serpItems);

  const runId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await ContentRepository.createTopicResearchRun({
    id: runId,
    projectId: input.projectId,
    seedKeyword: input.seedKeyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    questionsJson: JSON.stringify(questions),
    relatedSearchesJson: JSON.stringify(relatedSearches),
    createdByUserId: input.userId,
  });

  const clusterIds = clusters.map(() => crypto.randomUUID());
  await ContentRepository.insertTopicClusters(
    clusters.map((cluster, index) => ({
      id: clusterIds[index],
      runId,
      label: cluster.label,
      intent: cluster.intent,
      totalSearchVolume: cluster.totalSearchVolume,
      keywordsJson: JSON.stringify(cluster.keywords),
    })),
  );

  return {
    runId,
    seedKeyword: input.seedKeyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    questions,
    relatedSearches,
    clusters: clusters.map((cluster, index) => ({
      ...cluster,
      id: clusterIds[index],
    })),
    createdAt,
  };
}

async function getRun(
  runId: string,
  projectId: string,
): Promise<TopicResearchResult | null> {
  const run = await ContentRepository.getTopicResearchRun(runId, projectId);
  if (!run) return null;
  const clusterRows = await ContentRepository.getTopicClustersForRun(runId);
  return {
    runId: run.id,
    seedKeyword: run.seedKeyword,
    locationCode: run.locationCode,
    languageCode: run.languageCode,
    questions: decodeStringList(run.questionsJson),
    relatedSearches: decodeStringList(run.relatedSearchesJson),
    clusters: clusterRows.map((row) => ({
      id: row.id,
      label: row.label,
      intent: row.intent,
      totalSearchVolume: row.totalSearchVolume,
      keywords: decodeClusterKeywords(row.keywordsJson),
    })),
    createdAt: run.createdAt,
  };
}

type TopicResearchRunSummary = {
  runId: string;
  seedKeyword: string;
  locationCode: number;
  languageCode: string;
  createdAt: string;
};

async function listRuns(projectId: string): Promise<TopicResearchRunSummary[]> {
  const runs = await ContentRepository.listTopicResearchRuns(projectId);
  return runs.map((run) => ({
    runId: run.id,
    seedKeyword: run.seedKeyword,
    locationCode: run.locationCode,
    languageCode: run.languageCode,
    createdAt: run.createdAt,
  }));
}

export const TopicResearchService = { research, getRun, listRuns };
