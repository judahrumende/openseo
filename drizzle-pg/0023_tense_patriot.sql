CREATE TABLE "content_audit_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"audit_id" text NOT NULL,
	"url" text NOT NULL,
	"status_code" integer,
	"fetch_error" text,
	"title" text,
	"h1" text,
	"word_count" integer,
	"target_keyword" text,
	"target_keyword_source" text,
	"keyword_in_title" boolean,
	"keyword_in_h1" boolean,
	"is_thin" boolean DEFAULT false NOT NULL,
	"clicks_last_90" integer,
	"clicks_prior_90" integer,
	"impressions_last_90" integer,
	"impressions_prior_90" integer,
	"clicks_change_pct" real,
	"decay_status" text,
	"flags_json" text DEFAULT '[]' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"page_count" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_briefs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"topic_research_run_id" text,
	"target_keyword" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"title_options_json" text DEFAULT '[]' NOT NULL,
	"target_word_count" integer,
	"competitor_avg_word_count" integer,
	"competitor_sample_size" integer DEFAULT 0 NOT NULL,
	"outline_json" text DEFAULT '[]' NOT NULL,
	"entities_json" text DEFAULT '[]' NOT NULL,
	"target_reading_level" text,
	"model_used" text,
	"created_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_topic_clusters" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"label" text NOT NULL,
	"intent" text,
	"total_search_volume" integer,
	"keywords_json" text DEFAULT '[]' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_topic_research_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"seed_keyword" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"questions_json" text DEFAULT '[]' NOT NULL,
	"related_searches_json" text DEFAULT '[]' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_audit_pages" ADD CONSTRAINT "content_audit_pages_audit_id_content_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."content_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_audits" ADD CONSTRAINT "content_audits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_briefs" ADD CONSTRAINT "content_briefs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_briefs" ADD CONSTRAINT "content_briefs_topic_research_run_id_content_topic_research_runs_id_fk" FOREIGN KEY ("topic_research_run_id") REFERENCES "public"."content_topic_research_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_topic_clusters" ADD CONSTRAINT "content_topic_clusters_run_id_content_topic_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."content_topic_research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_topic_research_runs" ADD CONSTRAINT "content_topic_research_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_audit_pages_audit_url_idx" ON "content_audit_pages" USING btree ("audit_id","url");--> statement-breakpoint
CREATE INDEX "content_audits_project_created_idx" ON "content_audits" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "content_briefs_project_created_idx" ON "content_briefs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "content_briefs_topic_research_run_idx" ON "content_briefs" USING btree ("topic_research_run_id");--> statement-breakpoint
CREATE INDEX "content_topic_clusters_run_idx" ON "content_topic_clusters" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "content_topic_research_runs_project_created_idx" ON "content_topic_research_runs" USING btree ("project_id","created_at");