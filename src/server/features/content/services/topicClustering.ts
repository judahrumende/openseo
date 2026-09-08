import type { ClusterKeyword } from "@/server/features/content/contentJsonCodecs";

/**
 * Deterministic keyword clustering for Topic Research. Not ML — a simple
 * shared-head-term grouping: each candidate keyword joins the cluster of its
 * most frequent significant word (excluding the seed's own words and common
 * stopwords/modifiers), so "electric bike battery" and "e-bike battery life"
 * both land under "battery". Keywords with no significant word left over
 * (close variants of the seed itself) fall back to a cluster labeled after
 * the seed.
 */

export type KeywordIdea = {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  keywordDifficulty: number | null;
  intent: string | null;
};

export type TopicCluster = {
  label: string;
  intent: string | null;
  totalSearchVolume: number | null;
  keywords: ClusterKeyword[];
};

// Common function words plus a few generic ecommerce modifiers that appear
// across nearly every variant and would otherwise dominate as a false head
// term (a "best" cluster that just re-buckets everything).
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "for",
  "to",
  "in",
  "on",
  "at",
  "by",
  "with",
  "is",
  "are",
  "be",
  "your",
  "you",
  "my",
  "i",
  "this",
  "that",
  "it",
  "best",
  "top",
  "good",
  "cheap",
  "cheapest",
  "free",
  "new",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function dedupeByKeyword(ideas: KeywordIdea[]): KeywordIdea[] {
  const seen = new Map<string, KeywordIdea>();
  for (const idea of ideas) {
    const key = idea.keyword.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.set(key, idea);
  }
  return [...seen.values()];
}

function dominantIntent(members: KeywordIdea[]): string | null {
  const counts = new Map<string, number>();
  for (const member of members) {
    if (!member.intent) continue;
    counts.set(member.intent, (counts.get(member.intent) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [intent, count] of counts) {
    if (count > bestCount) {
      best = intent;
      bestCount = count;
    }
  }
  return best;
}

function toClusterKeyword(idea: KeywordIdea): ClusterKeyword {
  return {
    keyword: idea.keyword,
    searchVolume: idea.searchVolume,
    cpc: idea.cpc,
    keywordDifficulty: idea.keywordDifficulty,
  };
}

export function clusterKeywordIdeas(
  seedKeyword: string,
  ideas: KeywordIdea[],
  options: { maxClusters?: number; maxKeywordsPerCluster?: number } = {},
): TopicCluster[] {
  const maxClusters = options.maxClusters ?? 15;
  const maxPerCluster = options.maxKeywordsPerCluster ?? 12;
  const seedTokens = new Set(tokenize(seedKeyword));
  const deduped = dedupeByKeyword(ideas);

  // Frequency of each significant token across the whole candidate set,
  // computed up front so the same token always resolves to the same cluster
  // regardless of keyword iteration order.
  const tokensByKeyword = new Map<string, string[]>();
  const frequency = new Map<string, number>();
  for (const idea of deduped) {
    const tokens = tokenize(idea.keyword).filter(
      (token) =>
        token.length > 1 && !seedTokens.has(token) && !STOPWORDS.has(token),
    );
    tokensByKeyword.set(idea.keyword, tokens);
    for (const token of tokens) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }
  }

  const fallbackLabel = seedKeyword.trim().toLowerCase() || "general";
  const groups = new Map<string, KeywordIdea[]>();
  for (const idea of deduped) {
    const tokens = tokensByKeyword.get(idea.keyword) ?? [];
    let headToken: string | null = null;
    let headFrequency = 0;
    for (const token of tokens) {
      const count = frequency.get(token) ?? 0;
      if (count > headFrequency) {
        headFrequency = count;
        headToken = token;
      }
    }
    const label = headToken ?? fallbackLabel;
    const group = groups.get(label);
    if (group) group.push(idea);
    else groups.set(label, [idea]);
  }

  const clusters: TopicCluster[] = [...groups.entries()].map(
    ([label, members]) => {
      const hasVolume = members.some((member) => member.searchVolume != null);
      // `members` is this iteration's own array (never read again), so
      // sorting it in place is safe.
      // oxlint-disable-next-line unicorn/no-array-sort -- local array, not reused after this
      members.sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0));
      return {
        label,
        intent: dominantIntent(members),
        totalSearchVolume: hasVolume
          ? members.reduce((sum, member) => sum + (member.searchVolume ?? 0), 0)
          : null,
        keywords: members.slice(0, maxPerCluster).map(toClusterKeyword),
      };
    },
  );

  // `clusters` is a fresh local array built just above; sorting it in place
  // before returning is safe.
  // oxlint-disable-next-line unicorn/no-array-sort -- local array, not reused after this
  clusters.sort(
    (a, b) => (b.totalSearchVolume ?? 0) - (a.totalSearchVolume ?? 0),
  );
  return clusters.slice(0, maxClusters);
}
