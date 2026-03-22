CREATE TABLE "ad_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"ad_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "feed_ads" ADD COLUMN "episode_slug" text;--> statement-breakpoint
ALTER TABLE "feed_ads" ADD COLUMN "episode_title" text;--> statement-breakpoint
ALTER TABLE "feed_ads" ADD COLUMN "episode_tldl" text;--> statement-breakpoint
ALTER TABLE "feed_ads" ADD COLUMN "episode_key_insights" text[];--> statement-breakpoint
ALTER TABLE "feed_ads" ADD COLUMN "episode_quote" text;--> statement-breakpoint
ALTER TABLE "feed_ads" ADD COLUMN "episode_quote_attribution" text;--> statement-breakpoint
ALTER TABLE "feed_ads" ADD COLUMN "podcast_name" text;