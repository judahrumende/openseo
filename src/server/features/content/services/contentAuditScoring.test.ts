import { describe, expect, it } from "vitest";
import {
  buildPageFlags,
  computeDecaySignal,
  containsKeyword,
  isThinContent,
  THIN_CONTENT_WORD_THRESHOLD,
} from "./contentAuditScoring";

describe("isThinContent", () => {
  it("flags pages under the word-count threshold", () => {
    expect(isThinContent(THIN_CONTENT_WORD_THRESHOLD - 1)).toBe(true);
  });

  it("does not flag pages at or above the threshold", () => {
    expect(isThinContent(THIN_CONTENT_WORD_THRESHOLD)).toBe(false);
  });

  it("does not flag when word count is unknown", () => {
    expect(isThinContent(null)).toBe(false);
  });
});

describe("containsKeyword", () => {
  it("matches case-insensitively", () => {
    expect(containsKeyword("Best Electric Bikes 2026", "electric bikes")).toBe(
      true,
    );
  });

  it("returns false on a real non-match", () => {
    expect(containsKeyword("Best Electric Scooters", "electric bikes")).toBe(
      false,
    );
  });

  it("returns null when there's no target keyword to check", () => {
    expect(containsKeyword("Some Title", null)).toBeNull();
    expect(containsKeyword("Some Title", "")).toBeNull();
  });

  it("returns null when the field couldn't be read", () => {
    expect(containsKeyword(null, "electric bikes")).toBeNull();
  });
});

describe("computeDecaySignal", () => {
  it("flags a >=20% drop as declining", () => {
    const result = computeDecaySignal({ clicksLast90: 70, clicksPrior90: 100 });
    expect(result.status).toBe("declining");
    expect(result.changePct).toBeCloseTo(-0.3);
  });

  it("flags a >=20% rise as growing", () => {
    const result = computeDecaySignal({
      clicksLast90: 130,
      clicksPrior90: 100,
    });
    expect(result.status).toBe("growing");
    expect(result.changePct).toBeCloseTo(0.3);
  });

  it("treats a small change as stable", () => {
    const result = computeDecaySignal({
      clicksLast90: 105,
      clicksPrior90: 100,
    });
    expect(result.status).toBe("stable");
  });

  it("is insufficient_data with no prior-period baseline", () => {
    expect(
      computeDecaySignal({ clicksLast90: 50, clicksPrior90: 0 }).status,
    ).toBe("insufficient_data");
    expect(computeDecaySignal(null).status).toBe("insufficient_data");
  });
});

describe("buildPageFlags", () => {
  it("reports only fetch_failed when the fetch failed", () => {
    const flags = buildPageFlags({
      fetchFailed: true,
      isThin: true,
      keywordInTitle: false,
      keywordInH1: false,
      decayStatus: "declining",
    });
    expect(flags).toEqual(["fetch_failed"]);
  });

  it("combines every applicable flag when the fetch succeeded", () => {
    const flags = buildPageFlags({
      fetchFailed: false,
      isThin: true,
      keywordInTitle: false,
      keywordInH1: false,
      decayStatus: "declining",
    });
    expect(flags).toEqual([
      "thin_content",
      "missing_keyword_in_title",
      "missing_keyword_in_h1",
      "declining_performance",
    ]);
  });

  it("does not flag a keyword check that couldn't be evaluated (null)", () => {
    const flags = buildPageFlags({
      fetchFailed: false,
      isThin: false,
      keywordInTitle: null,
      keywordInH1: null,
      decayStatus: "insufficient_data",
    });
    expect(flags).toEqual([]);
  });
});
