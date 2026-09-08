import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

// Mirrors src/db/content.schema.ts — see that file for column comments.
// Timestamp text/isoNow convention matches pg/app.schema.ts.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const timestampColumn = (name: string) => text(name);

export const contentTopicResearchRuns = pgTable(
  "content_topic_research_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    seedKeyword: text("seed_keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    questionsJson: text("questions_json").notNull().default("[]"),
    relatedSearchesJson: text("related_searches_json").notNull().default("[]"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
  },
  (table) => [
    index("content_topic_research_runs_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const contentTopicClusters = pgTable(
  "content_topic_clusters",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => contentTopicResearchRuns.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    intent: text("intent"),
    totalSearchVolume: integer("total_search_volume"),
    keywordsJson: text("keywords_json").notNull().default("[]"),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
  },
  (table) => [index("content_topic_clusters_run_idx").on(table.runId)],
);

export const contentBriefs = pgTable(
  "content_briefs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    topicResearchRunId: text("topic_research_run_id").references(
      () => contentTopicResearchRuns.id,
      { onDelete: "set null" },
    ),
    targetKeyword: text("target_keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    titleOptionsJson: text("title_options_json").notNull().default("[]"),
    targetWordCount: integer("target_word_count"),
    competitorAvgWordCount: integer("competitor_avg_word_count"),
    competitorSampleSize: integer("competitor_sample_size")
      .notNull()
      .default(0),
    outlineJson: text("outline_json").notNull().default("[]"),
    entitiesJson: text("entities_json").notNull().default("[]"),
    targetReadingLevel: text("target_reading_level"),
    modelUsed: text("model_used"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
  },
  (table) => [
    index("content_briefs_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    index("content_briefs_topic_research_run_idx").on(table.topicResearchRunId),
  ],
);

export const contentAudits = pgTable(
  "content_audits",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").notNull(),
    pageCount: integer("page_count").notNull().default(0),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
  },
  (table) => [
    index("content_audits_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const contentAuditPages = pgTable(
  "content_audit_pages",
  {
    id: text("id").primaryKey(),
    auditId: text("audit_id")
      .notNull()
      .references(() => contentAudits.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    statusCode: integer("status_code"),
    fetchError: text("fetch_error"),
    title: text("title"),
    h1: text("h1"),
    wordCount: integer("word_count"),
    targetKeyword: text("target_keyword"),
    targetKeywordSource: text("target_keyword_source", {
      enum: ["manual", "gsc"],
    }),
    keywordInTitle: boolean("keyword_in_title"),
    keywordInH1: boolean("keyword_in_h1"),
    isThin: boolean("is_thin").notNull().default(false),
    clicksLast90: integer("clicks_last_90"),
    clicksPrior90: integer("clicks_prior_90"),
    impressionsLast90: integer("impressions_last_90"),
    impressionsPrior90: integer("impressions_prior_90"),
    clicksChangePct: real("clicks_change_pct"),
    decayStatus: text("decay_status", {
      enum: ["declining", "stable", "growing", "insufficient_data"],
    }),
    flagsJson: text("flags_json").notNull().default("[]"),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("content_audit_pages_audit_url_idx").on(
      table.auditId,
      table.url,
    ),
  ],
);
