import type { SerpLiveItem } from "@/server/lib/dataforseo/serp";
import { isRecord } from "@/server/lib/dataforseo/envelope";

/**
 * Pulls "People Also Ask" questions and Google's "related searches" out of a
 * standard organic/live/advanced item list. DataForSEO mixes these SERP
 * feature blocks into the same `items` array as the organic results
 * (`type: "people_also_ask"` / `"related_searches"`, each carrying its own
 * nested `items`); `SerpLiveItem`'s schema only types the common organic
 * fields, so the nested payload is read defensively here rather than
 * over-modeling a shape we haven't validated end to end.
 */

const MAX_QUESTIONS = 20;
const MAX_RELATED_SEARCHES = 20;

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function extractPeopleAlsoAsk(items: SerpLiveItem[]): string[] {
  const block = items.find((item) => item.type === "people_also_ask");
  const nested = isRecord(block) ? block.items : undefined;
  if (!Array.isArray(nested)) return [];

  const questions: string[] = [];
  for (const entry of nested) {
    if (!isRecord(entry)) continue;
    // DataForSEO's element field naming has drifted across API versions; try
    // the known candidates rather than trusting one.
    const text = entry.title ?? entry.question ?? entry.seed_question;
    if (typeof text === "string" && text.trim()) questions.push(text);
  }
  return dedupe(questions).slice(0, MAX_QUESTIONS);
}

export function extractRelatedSearches(items: SerpLiveItem[]): string[] {
  const block = items.find((item) => item.type === "related_searches");
  const nested = isRecord(block) ? block.items : undefined;
  if (!Array.isArray(nested)) return [];

  const values = nested.filter(
    (entry): entry is string => typeof entry === "string",
  );
  return dedupe(values).slice(0, MAX_RELATED_SEARCHES);
}
