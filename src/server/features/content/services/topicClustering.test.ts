import { describe, expect, it } from "vitest";
import { clusterKeywordIdeas, type KeywordIdea } from "./topicClustering";

function idea(
  overrides: Partial<KeywordIdea> & { keyword: string },
): KeywordIdea {
  return {
    searchVolume: null,
    cpc: null,
    keywordDifficulty: null,
    intent: null,
    ...overrides,
  };
}

describe("clusterKeywordIdeas", () => {
  it("groups keywords by their shared significant word", () => {
    const clusters = clusterKeywordIdeas("electric bike", [
      idea({ keyword: "electric bike battery", searchVolume: 500 }),
      idea({ keyword: "e bike battery life", searchVolume: 300 }),
      idea({ keyword: "electric bike price", searchVolume: 900 }),
      idea({ keyword: "electric bike price uk", searchVolume: 100 }),
    ]);

    const battery = clusters.find((c) => c.label === "battery");
    const price = clusters.find((c) => c.label === "price");
    expect(battery?.keywords.map((k) => k.keyword)).toEqual(
      expect.arrayContaining(["electric bike battery", "e bike battery life"]),
    );
    expect(price?.keywords).toHaveLength(2);
  });

  it("sums search volume per cluster and sorts clusters by it descending", () => {
    const clusters = clusterKeywordIdeas("widget", [
      idea({ keyword: "widget reviews", searchVolume: 100 }),
      idea({ keyword: "best widget reviews", searchVolume: 50 }),
      idea({ keyword: "widget repair", searchVolume: 400 }),
    ]);

    expect(clusters[0].label).toBe("repair");
    expect(clusters[0].totalSearchVolume).toBe(400);
    const reviews = clusters.find((c) => c.label === "reviews");
    expect(reviews?.totalSearchVolume).toBe(150);
  });

  it("falls back to a seed-labeled cluster for keywords with no other significant word", () => {
    const clusters = clusterKeywordIdeas("electric bike", [
      idea({ keyword: "electric bike", searchVolume: 1000 }),
      idea({ keyword: "bike electric", searchVolume: 200 }),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].label).toBe("electric bike");
  });

  it("picks the dominant (majority) intent among a cluster's keywords", () => {
    const clusters = clusterKeywordIdeas("gadget", [
      idea({
        keyword: "gadget cover blue",
        searchVolume: 10,
        intent: "commercial",
      }),
      idea({
        keyword: "gadget cover red",
        searchVolume: 10,
        intent: "commercial",
      }),
      idea({
        keyword: "gadget cover green",
        searchVolume: 10,
        intent: "informational",
      }),
    ]);

    const coverCluster = clusters.find((c) => c.label === "cover");
    expect(coverCluster?.keywords).toHaveLength(3);
    expect(coverCluster?.intent).toBe("commercial");
  });

  it("deduplicates repeated keywords (case/whitespace-insensitive)", () => {
    const clusters = clusterKeywordIdeas("widget", [
      idea({ keyword: "widget battery", searchVolume: 10 }),
      idea({ keyword: "Widget Battery ", searchVolume: 999 }),
    ]);

    const total = clusters.reduce((sum, c) => sum + c.keywords.length, 0);
    expect(total).toBe(1);
  });

  it("caps clusters to maxClusters, keeping the highest-volume ones", () => {
    const ideas: KeywordIdea[] = [];
    for (let i = 0; i < 10; i++) {
      ideas.push(
        idea({ keyword: `widget cluster${i}`, searchVolume: (10 - i) * 10 }),
      );
    }
    const clusters = clusterKeywordIdeas("widget", ideas, { maxClusters: 3 });
    expect(clusters).toHaveLength(3);
    expect(clusters.map((c) => c.label)).toEqual([
      "cluster0",
      "cluster1",
      "cluster2",
    ]);
  });

  it("caps keywords kept per cluster to maxKeywordsPerCluster, keeping the highest-volume ones", () => {
    const ideas: KeywordIdea[] = [];
    for (let i = 0; i < 6; i++) {
      ideas.push(
        idea({ keyword: `widget battery variant${i}`, searchVolume: 10 - i }),
      );
    }
    const clusters = clusterKeywordIdeas("widget", ideas, {
      maxKeywordsPerCluster: 2,
    });
    expect(clusters[0].label).toBe("battery");
    expect(clusters[0].keywords.map((k) => k.searchVolume)).toEqual([10, 9]);
  });
});
