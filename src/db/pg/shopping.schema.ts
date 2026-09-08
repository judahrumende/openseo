import { sql } from "drizzle-orm";
import { index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

// Mirrors src/db/shopping.schema.ts — see that file for column comments.
// Timestamp text/isoNow convention matches pg/app.schema.ts.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const timestampColumn = (name: string) => text(name);

export const shoppingProductSearches = pgTable(
  "shopping_product_searches",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    taskId: text("task_id").notNull(),
    status: text("status", {
      enum: ["pending", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    errorMessage: text("error_message"),
    listingsJson: text("listings_json").notNull().default("[]"),
    priceStatsJson: text("price_stats_json"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("shopping_product_searches_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const shoppingDomainOverviews = pgTable(
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
    overviewJson: text("overview_json"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestampColumn("created_at").notNull().default(isoNow),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("shopping_domain_overviews_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);
