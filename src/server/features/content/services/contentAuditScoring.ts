import type { PageFlag } from "@/server/features/content/contentJsonCodecs";

/**
 * Pure scoring math for Content Audit: thin-content threshold, title/H1
 * keyword matching, and the 90-vs-prior-90-day GSC decay signal. Kept
 * side-effect free so it's directly unit-testable without a DB or network.
 * `PageFlag` is a type-only import — the flag vocabulary is owned by
 * contentJsonCodecs.ts (the DB column's JSON codec) so it has one definition.
 */

export const THIN_CONTENT_WORD_THRESHOLD = 300;
// Symmetric +/-20% band: below it counts as decline, above as growth, inside
// as noise-level "stable". Chosen to flag real trend, not week-to-week churn.
const DECAY_DECLINE_THRESHOLD = -0.2;
const DECAY_GROWTH_THRESHOLD = 0.2;

export function isThinContent(wordCount: number | null): boolean {
  return wordCount != null && wordCount < THIN_CONTENT_WORD_THRESHOLD;
}

/** Case-insensitive substring match. Null when there's nothing to check
 *  (no target keyword, or the page/field couldn't be fetched). */
export function containsKeyword(
  haystack: string | null,
  keyword: string | null,
): boolean | null {
  if (!keyword?.trim() || haystack == null) return null;
  return haystack.toLowerCase().includes(keyword.trim().toLowerCase());
}

export type DecayStatus =
  | "declining"
  | "stable"
  | "growing"
  | "insufficient_data";

type DecayResult = {
  changePct: number | null;
  status: DecayStatus;
};

/**
 * Compares clicks over the last 90 days against the 90 days before that.
 * `null` input (GSC not connected, or the page had no traffic data) and a
 * zero prior-period baseline both resolve to "insufficient_data" — a 0->N
 * change is not a meaningful percentage.
 */
export function computeDecaySignal(
  input: { clicksLast90: number; clicksPrior90: number } | null,
): DecayResult {
  if (!input || input.clicksPrior90 <= 0) {
    return { changePct: null, status: "insufficient_data" };
  }
  const changePct =
    (input.clicksLast90 - input.clicksPrior90) / input.clicksPrior90;
  if (changePct <= DECAY_DECLINE_THRESHOLD) {
    return { changePct, status: "declining" };
  }
  if (changePct >= DECAY_GROWTH_THRESHOLD) {
    return { changePct, status: "growing" };
  }
  return { changePct, status: "stable" };
}

/** A failed fetch reports only that flag — every other check has nothing to
 *  evaluate, so surfacing them as false negatives would be misleading. */
export function buildPageFlags(input: {
  fetchFailed: boolean;
  isThin: boolean;
  keywordInTitle: boolean | null;
  keywordInH1: boolean | null;
  decayStatus: DecayStatus;
}): PageFlag[] {
  if (input.fetchFailed) return ["fetch_failed"];
  const flags: PageFlag[] = [];
  if (input.isThin) flags.push("thin_content");
  if (input.keywordInTitle === false) flags.push("missing_keyword_in_title");
  if (input.keywordInH1 === false) flags.push("missing_keyword_in_h1");
  if (input.decayStatus === "declining") flags.push("declining_performance");
  return flags;
}
