import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./app.schema";

// ============================================================================
// Content Marketing Toolkit tables: Topic Research, Content Brief / Writing
// Assistant, and Content Audit. One feature directory (src/server/features/
// content/), sharing this schema file.
// ============================================================================

// One row per topic-research run (a seed keyword researched at a point in
// time). Questions/related searches are leaf lists tied 1:1 to the run (never
// queried on their own), stored as JSON like keywordMetrics.monthlySearches.
export const contentTopicResearchRuns = sqliteTable(
  "content_topic_research_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    seedKeyword: text("seed_keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    // JSON string[]: People Also Ask questions surfaced for the seed keyword.
    questionsJson: text("questions_json").notNull().default("[]"),
    // JSON string[]: Google "related searches" surfaced for the seed keyword.
    relatedSearchesJson: text("related_searches_json").notNull().default("[]"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("content_topic_research_runs_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

// One row per subtopic cluster within a run. keywordsJson is a leaf list of
// {keyword, searchVolume, cpc, keywordDifficulty} tied 1:1 to the cluster.
export const contentTopicClusters = sqliteTable(
  "content_topic_clusters",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => contentTopicResearchRuns.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    // Dominant search_intent_info.main_intent among the cluster's keywords;
    // null when DataForSEO didn't report intent for any of them.
    intent: text("intent"),
    totalSearchVolume: integer("total_search_volume"),
    keywordsJson: text("keywords_json").notNull().default("[]"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("content_topic_clusters_run_idx").on(table.runId)],
);

// One row per generated content brief.
export const contentBriefs = sqliteTable(
  "content_briefs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Optional seed: the topic-research run this brief was generated from.
    // SET NULL on delete — the brief stays readable after its source run is
    // pruned, it just loses the backlink.
    topicResearchRunId: text("topic_research_run_id").references(
      () => contentTopicResearchRuns.id,
      { onDelete: "set null" },
    ),
    targetKeyword: text("target_keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    // JSON string[]: candidate titles.
    titleOptionsJson: text("title_options_json").notNull().default("[]"),
    // Derived from competitor page word counts fetched live; null when no
    // competitor page could be fetched.
    targetWordCount: integer("target_word_count"),
    competitorAvgWordCount: integer("competitor_avg_word_count"),
    competitorSampleSize: integer("competitor_sample_size")
      .notNull()
      .default(0),
    // JSON Array<{level:"h2"|"h3", heading, notes}>.
    outlineJson: text("outline_json").notNull().default("[]"),
    // JSON string[]: entities/related terms to cover.
    entitiesJson: text("entities_json").notNull().default("[]"),
    targetReadingLevel: text("target_reading_level"),
    modelUsed: text("model_used"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("content_briefs_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    index("content_briefs_topic_research_run_idx").on(table.topicResearchRunId),
  ],
);

// One row per content-audit run.
export const contentAudits = sqliteTable(
  "content_audits",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").notNull(),
    pageCount: integer("page_count").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("content_audits_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

// One row per audited URL within a content-audit run.
export const contentAuditPages = sqliteTable(
  "content_audit_pages",
  {
    id: text("id").primaryKey(),
    auditId: text("audit_id")
      .notNull()
      .references(() => contentAudits.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    statusCode: integer("status_code"),
    // Set when the page could not be fetched/parsed at all (blocked, SSRF
    // guard, network error); statusCode/title/h1/wordCount are null then.
    fetchError: text("fetch_error"),
    title: text("title"),
    h1: text("h1"),
    wordCount: integer("word_count"),
    // The keyword this page is scored against — explicitly supplied, or the
    // page's top Search Console query when GSC is connected.
    targetKeyword: text("target_keyword"),
    targetKeywordSource: text("target_keyword_source", {
      enum: ["manual", "gsc"],
    }),
    keywordInTitle: integer("keyword_in_title", { mode: "boolean" }),
    keywordInH1: integer("keyword_in_h1", { mode: "boolean" }),
    isThin: integer("is_thin", { mode: "boolean" }).notNull().default(false),
    clicksLast90: integer("clicks_last_90"),
    clicksPrior90: integer("clicks_prior_90"),
    impressionsLast90: integer("impressions_last_90"),
    impressionsPrior90: integer("impressions_prior_90"),
    // Fractional change (e.g. -0.35 = -35%); null when prior-period clicks
    // were 0 (no baseline to compare against).
    clicksChangePct: real("clicks_change_pct"),
    decayStatus: text("decay_status", {
      enum: ["declining", "stable", "growing", "insufficient_data"],
    }),
    // JSON string[]: flag codes, e.g. "thin_content", "missing_keyword_title".
    flagsJson: text("flags_json").notNull().default("[]"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("content_audit_pages_audit_url_idx").on(
      table.auditId,
      table.url,
    ),
  ],
);
