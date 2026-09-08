import { sql } from "drizzle-orm";
import { index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

// Mirrors src/db/advertising.schema.ts — see that file for column comments.
// Timestamp text/isoNow convention matches pg/app.schema.ts.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const timestampColumn = (name: string) => text(name);

export const advertisingAdvertiserSearches = pgTable(
  "advertising_advertiser_searches",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    advertisersJson: text("advertisers_json").notNull().default("[]"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
  },
  (table) => [
    index("advertising_advertiser_searches_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const advertisingAdCopySearches = pgTable(
  "advertising_ad_copy_searches",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    advertiserSearchId: text("advertiser_search_id").references(
      () => advertisingAdvertiserSearches.id,
      { onDelete: "set null" },
    ),
    advertiserIdsJson: text("advertiser_ids_json").notNull().default("[]"),
    adsJson: text("ads_json").notNull().default("[]"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
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

export const advertisingAdCopyDrafts = pgTable(
  "advertising_ad_copy_drafts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    targetKeyword: text("target_keyword").notNull(),
    inspirationSearchId: text("inspiration_search_id").references(
      () => advertisingAdCopySearches.id,
      { onDelete: "set null" },
    ),
    variantsJson: text("variants_json").notNull().default("[]"),
    modelUsed: text("model_used"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
  },
  (table) => [
    index("advertising_ad_copy_drafts_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);
