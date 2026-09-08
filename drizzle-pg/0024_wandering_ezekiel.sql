CREATE TABLE "shopping_domain_overviews" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"target_domain" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"task_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"overview_json" text,
	"created_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "shopping_product_searches" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"keyword" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"task_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"listings_json" text DEFAULT '[]' NOT NULL,
	"price_stats_json" text,
	"created_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "advertising_ad_copy_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"target_keyword" text NOT NULL,
	"inspiration_search_id" text,
	"variants_json" text DEFAULT '[]' NOT NULL,
	"model_used" text,
	"created_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advertising_ad_copy_searches" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"advertiser_search_id" text,
	"advertiser_ids_json" text DEFAULT '[]' NOT NULL,
	"ads_json" text DEFAULT '[]' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advertising_advertiser_searches" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"keyword" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"advertisers_json" text DEFAULT '[]' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shopping_domain_overviews" ADD CONSTRAINT "shopping_domain_overviews_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_product_searches" ADD CONSTRAINT "shopping_product_searches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advertising_ad_copy_drafts" ADD CONSTRAINT "advertising_ad_copy_drafts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advertising_ad_copy_drafts" ADD CONSTRAINT "advertising_ad_copy_drafts_inspiration_search_id_advertising_ad_copy_searches_id_fk" FOREIGN KEY ("inspiration_search_id") REFERENCES "public"."advertising_ad_copy_searches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advertising_ad_copy_searches" ADD CONSTRAINT "advertising_ad_copy_searches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advertising_ad_copy_searches" ADD CONSTRAINT "advertising_ad_copy_searches_advertiser_search_id_advertising_advertiser_searches_id_fk" FOREIGN KEY ("advertiser_search_id") REFERENCES "public"."advertising_advertiser_searches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advertising_advertiser_searches" ADD CONSTRAINT "advertising_advertiser_searches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shopping_domain_overviews_project_created_idx" ON "shopping_domain_overviews" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "shopping_product_searches_project_created_idx" ON "shopping_product_searches" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "advertising_ad_copy_drafts_project_created_idx" ON "advertising_ad_copy_drafts" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "advertising_ad_copy_searches_project_created_idx" ON "advertising_ad_copy_searches" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "advertising_ad_copy_searches_advertiser_search_idx" ON "advertising_ad_copy_searches" USING btree ("advertiser_search_id");--> statement-breakpoint
CREATE INDEX "advertising_advertiser_searches_project_created_idx" ON "advertising_advertiser_searches" USING btree ("project_id","created_at");