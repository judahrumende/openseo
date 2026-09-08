import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./app.schema";

// ============================================================================
// Shopping/PLA Research tables (src/server/features/shopping/). Both product
// search and domain overview go through DataForSEO's Merchant API async
// task_post/task_get pattern (see src/server/lib/dataforseo/merchant.ts for
// why), so each run tracks the provider task id and a pending/completed/
// failed status while the caller polls it to completion.
// ============================================================================

// One row per Google Shopping product search (a keyword researched at a point
// in time). Listings are a leaf list tied 1:1 to the run — like
// contentTopicClusters.keywordsJson — stored as JSON rather than a child
// table since they're never queried on their own.
export const shoppingProductSearches = sqliteTable(
  "shopping_product_searches",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    // DataForSEO merchant/google/products task id, set at task_post.
    taskId: text("task_id").notNull(),
    status: text("status", {
      enum: ["pending", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    errorMessage: text("error_message"),
    // JSON Array<{position, title, url, sellerDomain, seller, price,
    // currency, rating, ratingCount, isProjectDomain}>. Set once the task
    // completes; "[]" while pending or failed.
    listingsJson: text("listings_json").notNull().default("[]"),
    // JSON {min, max, median, currency, sampleSize} | null. Price-band summary
    // derived from listingsJson at completion time, so reads don't recompute
    // it from the raw list.
    priceStatsJson: text("price_stats_json"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("shopping_product_searches_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

// One row per Google Shopping domain-visibility overview run. overviewJson is
// an intentionally raw passthrough of whatever DataForSEO's merchant/google/
// overview task returns — see merchant.ts for why the exact response shape is
// unverified.
export const shoppingDomainOverviews = sqliteTable(
  "shopping_domain_overviews",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    targetDomain: text("target_domain").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    taskId: text("task_id").notNull(),
    status: text("status", {
      enum: ["pending", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    errorMessage: text("error_message"),
    // JSON: the raw result object, or null while pending/failed.
    overviewJson: text("overview_json"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("shopping_domain_overviews_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);
