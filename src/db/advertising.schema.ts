import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./app.schema";

// ============================================================================
// Advertising Research tables (src/server/features/advertising/). Two live
// research tools (which advertisers run ads for a keyword, and their actual ad
// copy) backed by DataForSEO's SERP Ads Transparency endpoints, plus a
// separate AI ad-copy drafting tool. One feature directory, sharing this
// schema file — same shape as content.schema.ts.
// ============================================================================

// One row per "who's advertising on this keyword" search.
export const advertisingAdvertiserSearches = sqliteTable(
  "advertising_advertiser_searches",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    // JSON Array<passthrough advertiser row> — advertiser_id, domain,
    // verified, approximate ad count, etc; see ads-transparency.ts for why
    // this stays a raw passthrough.
    advertisersJson: text("advertisers_json").notNull().default("[]"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("advertising_advertiser_searches_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

// One row per ad-copy collection for a set of advertiser ids (usually seeded
// from an advertiser search above, but can be queried directly).
export const advertisingAdCopySearches = sqliteTable(
  "advertising_ad_copy_searches",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Optional seed: the advertiser search these advertiser ids came from.
    // SET NULL on delete, like contentBriefs.topicResearchRunId.
    advertiserSearchId: text("advertiser_search_id").references(
      () => advertisingAdvertiserSearches.id,
      { onDelete: "set null" },
    ),
    // JSON string[]: the advertiser_ids queried.
    advertiserIdsJson: text("advertiser_ids_json").notNull().default("[]"),
    // JSON Array<passthrough ad row> — creative title/description/domain when
    // the endpoint returns it.
    adsJson: text("ads_json").notNull().default("[]"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("advertising_ad_copy_searches_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    index("advertising_ad_copy_searches_advertiser_search_idx").on(
      table.advertiserSearchId,
    ),
  ],
);

// One row per AI-generated ad copy draft.
export const advertisingAdCopyDrafts = sqliteTable(
  "advertising_ad_copy_drafts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    targetKeyword: text("target_keyword").notNull(),
    // Optional seed: competitor ad copy used as inspiration.
    inspirationSearchId: text("inspiration_search_id").references(
      () => advertisingAdCopySearches.id,
      { onDelete: "set null" },
    ),
    // JSON Array<{headline: string, description: string}>, 3-5 variants.
    variantsJson: text("variants_json").notNull().default("[]"),
    modelUsed: text("model_used"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("advertising_ad_copy_drafts_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);
