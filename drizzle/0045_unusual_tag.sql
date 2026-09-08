CREATE TABLE `content_audit_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_id` text NOT NULL,
	`url` text NOT NULL,
	`status_code` integer,
	`fetch_error` text,
	`title` text,
	`h1` text,
	`word_count` integer,
	`target_keyword` text,
	`target_keyword_source` text,
	`keyword_in_title` integer,
	`keyword_in_h1` integer,
	`is_thin` integer DEFAULT false NOT NULL,
	`clicks_last_90` integer,
	`clicks_prior_90` integer,
	`impressions_last_90` integer,
	`impressions_prior_90` integer,
	`clicks_change_pct` real,
	`decay_status` text,
	`flags_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`audit_id`) REFERENCES `content_audits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_audit_pages_audit_url_idx` ON `content_audit_pages` (`audit_id`,`url`);--> statement-breakpoint
CREATE TABLE `content_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`page_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `content_audits_project_created_idx` ON `content_audits` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `content_briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`topic_research_run_id` text,
	`target_keyword` text NOT NULL,
	`location_code` integer NOT NULL,
	`language_code` text NOT NULL,
	`title_options_json` text DEFAULT '[]' NOT NULL,
	`target_word_count` integer,
	`competitor_avg_word_count` integer,
	`competitor_sample_size` integer DEFAULT 0 NOT NULL,
	`outline_json` text DEFAULT '[]' NOT NULL,
	`entities_json` text DEFAULT '[]' NOT NULL,
	`target_reading_level` text,
	`model_used` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_research_run_id`) REFERENCES `content_topic_research_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `content_briefs_project_created_idx` ON `content_briefs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `content_briefs_topic_research_run_idx` ON `content_briefs` (`topic_research_run_id`);--> statement-breakpoint
CREATE TABLE `content_topic_clusters` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`label` text NOT NULL,
	`intent` text,
	`total_search_volume` integer,
	`keywords_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `content_topic_research_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `content_topic_clusters_run_idx` ON `content_topic_clusters` (`run_id`);--> statement-breakpoint
CREATE TABLE `content_topic_research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`seed_keyword` text NOT NULL,
	`location_code` integer NOT NULL,
	`language_code` text NOT NULL,
	`questions_json` text DEFAULT '[]' NOT NULL,
	`related_searches_json` text DEFAULT '[]' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `content_topic_research_runs_project_created_idx` ON `content_topic_research_runs` (`project_id`,`created_at`);