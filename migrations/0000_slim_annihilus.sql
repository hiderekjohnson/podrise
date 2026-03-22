CREATE TABLE "ad_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"ad_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "advertisers" (
	"id" serial PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"link" text DEFAULT '',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliate_clicks" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_type" text NOT NULL,
	"product_name" text NOT NULL,
	"product_id" integer,
	"destination_url" text NOT NULL,
	"referrer_page" text,
	"user_id" integer,
	"clicked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "api_usage_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"feature" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0,
	"completion_tokens" integer DEFAULT 0,
	"total_tokens" integer DEFAULT 0,
	"estimated_cost" real DEFAULT 0,
	"metadata" jsonb,
	"service" text DEFAULT 'openai',
	"podcast_slug" text,
	"episode_slug" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audio_playback_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"podcast_slug" text NOT NULL,
	"episode_slug" text NOT NULL,
	"event_type" text NOT NULL,
	"percentage_reached" real DEFAULT 0,
	"session_id" text,
	"user_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "backfill_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"total_records" integer,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "backfill_jobs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "book_bookmarks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"book_slug" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "book_bookmarks_user_id_book_slug_unique" UNIQUE("user_id","book_slug")
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"episode_slug" text NOT NULL,
	"podcast_slug" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_drop_editions" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"headline" text NOT NULL,
	"subheadline" text,
	"body" text NOT NULL,
	"episode_slugs" text[],
	"generated_at" timestamp DEFAULT now(),
	CONSTRAINT "daily_drop_editions_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"device_token" text NOT NULL,
	"platform" text DEFAULT 'ios' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "device_tokens_device_token_unique" UNIQUE("device_token")
);
--> statement-breakpoint
CREATE TABLE "email_clicks" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_id" integer NOT NULL,
	"url" text NOT NULL,
	"clicked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"recipient_email" text NOT NULL,
	"podcasts" text[] NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"email_html" text,
	"sent_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_template_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "email_template_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "email_verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "entity_companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"logo_url" text,
	"industry" text,
	"website_url" text,
	"twitter_handle" text,
	"category" text,
	"search_terms" text[] DEFAULT '{}' NOT NULL,
	"associated_terms" text[] DEFAULT '{}' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "entity_companies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "entity_episode_mentions" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_slug" text NOT NULL,
	"recap_id" integer NOT NULL,
	"episode_slug" text NOT NULL,
	"podcast_slug" text NOT NULL,
	"context" text,
	"mention_count" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "entity_episode_unique" UNIQUE("entity_type","entity_slug","recap_id")
);
--> statement-breakpoint
CREATE TABLE "entity_people" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"photo_url" text,
	"title" text,
	"company" text,
	"twitter_handle" text,
	"linkedin_url" text,
	"website_url" text,
	"category" text,
	"search_terms" text[] DEFAULT '{}' NOT NULL,
	"hosted_slugs" text[] DEFAULT '{}' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "entity_people_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "episode_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"podcast_slug" text NOT NULL,
	"episode_slug" text NOT NULL,
	"speaker_name" text NOT NULL,
	"speaker_role" text,
	"quote_text" text NOT NULL,
	"context" text NOT NULL,
	"quote_type" text NOT NULL,
	"sort_order" serial NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "episode_transcripts" (
	"id" serial PRIMARY KEY NOT NULL,
	"podcast_id" text NOT NULL,
	"episode_guid" text NOT NULL,
	"episode_title" text NOT NULL,
	"transcript" text NOT NULL,
	"description" text,
	"subtitle" text,
	"date_published" integer,
	"duration" integer,
	"audio_url" text,
	"image_url" text,
	"season_number" integer,
	"episode_number" integer,
	"episode_type" text,
	"complete_record" boolean DEFAULT false,
	"fetched_at" timestamp DEFAULT now(),
	CONSTRAINT "episode_transcripts_episode_guid_unique" UNIQUE("episode_guid")
);
--> statement-breakpoint
CREATE TABLE "error_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"http_status" integer DEFAULT 500 NOT NULL,
	"error_message" text NOT NULL,
	"friendly_summary" text NOT NULL,
	"severity" text DEFAULT 'error' NOT NULL,
	"method" text,
	"user_agent" text,
	"user_id" integer,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"first_occurred_at" timestamp DEFAULT now(),
	"last_occurred_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "extracted_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"description" text,
	"purchase_url" text,
	"image_url" text,
	"context" text,
	"context_summary" text,
	"mention_type" text,
	"category" text DEFAULT 'physical_product' NOT NULL,
	"episode_title" text NOT NULL,
	"episode_slug" text,
	"podcast_slug" text DEFAULT 'myfirstmillion' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"image_status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"approved_by" text,
	"approved_at" timestamp,
	"extracted_at" timestamp DEFAULT now(),
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "feature_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"feature" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "feature_events_feature_check" CHECK ("feature_events"."feature" IN ('ai_chat', 'episode_link', 'spotify_import'))
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "feature_flags_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "feed_ad_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "feed_ad_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "feed_ads" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"image_url" text NOT NULL,
	"destination_url" text DEFAULT '',
	"podcast_slug" text,
	"episode_slug" text,
	"episode_title" text,
	"episode_tldl" text,
	"episode_key_insights" text[],
	"episode_quote" text,
	"episode_quote_attribution" text,
	"podcast_name" text,
	"weight" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "landing_page_recaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"itunes_id" text,
	"podcast_name" text NOT NULL,
	"episode_title" text NOT NULL,
	"episode_slug" text NOT NULL,
	"publish_date" text NOT NULL,
	"duration" text,
	"artwork_url" text,
	"hosts" text,
	"tldl" text NOT NULL,
	"what_happened" text NOT NULL,
	"key_insights" text[] NOT NULL,
	"quote" text,
	"quote_attribution" text,
	"apple_episode_url" text,
	"spotify_episode_url" text,
	"audio_url" text,
	"youtube_url" text,
	"key_topics" text[],
	"topic_contexts" text,
	"top_questions" text,
	"sponsors" text,
	"guests" text,
	"show_notes" text,
	"resources" text,
	"published" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"tabloid_headline" text,
	"tabloid_sub_headline" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "landing_page_visits" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_slug" text NOT NULL,
	"session_id" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"utm_term" text,
	"ip_address" text,
	"user_agent" text,
	"device_type" text,
	"user_id" integer,
	"visited_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "magic_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "magic_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "mturk_workers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "mturk_workers_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "pending_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"recipient_email" text NOT NULL,
	"podcasts" text[] NOT NULL,
	"recap_date" date NOT NULL,
	"summary" text NOT NULL,
	"email_html" text NOT NULL,
	"subject" text NOT NULL,
	"scheduled_for" text NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"episode_stats" text,
	"source" text DEFAULT 'scheduled' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"error_message" text,
	"email_opened_at" timestamp,
	"first_clicked_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pending_transcript_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"podcast_id" text NOT NULL,
	"podcast_name" text NOT NULL,
	"episode_guid" text NOT NULL,
	"episode_title" text NOT NULL,
	"taddy_uuid" text,
	"priority" integer DEFAULT 50 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "podcast_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon" text,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "podcast_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "podcast_directory" (
	"id" serial PRIMARY KEY NOT NULL,
	"itunes_id" text NOT NULL,
	"slug" text,
	"name" text NOT NULL,
	"hosts" text,
	"category" text,
	"description" text,
	"keywords" text,
	"faq_topics" text,
	"artwork_url" text,
	"apple_url" text,
	"spotify_url" text,
	"youtube_url" text,
	"twitter_handle" text,
	"instagram_url" text,
	"tiktok_url" text,
	"facebook_url" text,
	"discord_url" text,
	"website_url" text,
	"store_url" text,
	"host_handle" text,
	"followers" integer,
	"avg_episode_length" integer,
	"frequency" text,
	"total_episodes" integer,
	"year_started" integer,
	"known_for" text[],
	"host_bios" jsonb,
	"related_slugs" text[],
	"about_podcast" text,
	"feed_url" text,
	"taddy_uuid" text,
	"apple_rating" text,
	"apple_rating_count" integer,
	"has_landing_page" boolean DEFAULT false,
	"status" text DEFAULT 'published' NOT NULL,
	"is_protected" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "podcast_directory_itunes_id_unique" UNIQUE("itunes_id"),
	CONSTRAINT "podcast_directory_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "podcast_example_recaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"podcast_name" text NOT NULL,
	"itunes_id" text,
	"episode_title" text NOT NULL,
	"episode_date" text NOT NULL,
	"episode_duration" text,
	"tldl" text NOT NULL,
	"what_happened" text NOT NULL,
	"key_insights" text[] NOT NULL,
	"quote" text,
	"quote_attribution" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "podcast_example_recaps_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "podcast_hosts" (
	"id" serial PRIMARY KEY NOT NULL,
	"podcast_slug" text NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"photo_url" text,
	"twitter_handle" text,
	"linkedin_url" text,
	"instagram_handle" text,
	"website_url" text,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "podcast_top_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"questions" text NOT NULL,
	"generated_at" timestamp DEFAULT now(),
	CONSTRAINT "podcast_top_questions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "podcaster_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"podcast_slug" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"custom_byline_text" text,
	"custom_byline_url" text,
	"custom_byline_label" text,
	"custom_sponsors" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "podcaster_claims_podcast_slug_unique" UNIQUE("podcast_slug")
);
--> statement-breakpoint
CREATE TABLE "product_podcast_buzz" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_key" text NOT NULL,
	"product_name" text NOT NULL,
	"company" text,
	"podcast_buzz" text NOT NULL,
	"generated_at" timestamp DEFAULT now(),
	CONSTRAINT "product_podcast_buzz_product_key_unique" UNIQUE("product_key")
);
--> statement-breakpoint
CREATE TABLE "pulse_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"topic_slug" text NOT NULL,
	"subscribed_at" timestamp DEFAULT now(),
	CONSTRAINT "pulse_subscriptions_user_topic_unique" UNIQUE("user_id","topic_slug")
);
--> statement-breakpoint
CREATE TABLE "recap_audio" (
	"id" serial PRIMARY KEY NOT NULL,
	"podcast_slug" text NOT NULL,
	"episode_slug" text NOT NULL,
	"audio_url" text,
	"elevenlabs_request_id" text,
	"voice_id" text,
	"character_count" integer DEFAULT 0,
	"audio_duration" real DEFAULT 0,
	"openai_script_cost" real DEFAULT 0,
	"elevenlabs_cost" real DEFAULT 0,
	"total_cost" real DEFAULT 0,
	"narration_script" text,
	"status" text DEFAULT 'not_generated' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"recap_date" date NOT NULL,
	"podcasts" text[] NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "referral_fulfillments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"tier_id" integer NOT NULL,
	"tier_threshold" integer NOT NULL,
	"status" text DEFAULT 'unsent' NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "referral_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"threshold" integer NOT NULL,
	"reward_name" text NOT NULL,
	"reward_description" text NOT NULL,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_id" integer NOT NULL,
	"referred_user_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"verified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "rss_feeds" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug_key" text NOT NULL,
	"podcast_slugs" text[] NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "rss_feeds_slug_key_unique" UNIQUE("slug_key")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "site_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "support_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"body" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "taddy_api_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"month_key" text NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"last_reset_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "taddy_api_usage_month_key_unique" UNIQUE("month_key")
);
--> statement-breakpoint
CREATE TABLE "topic_pulses" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic_slug" text NOT NULL,
	"publish_date" text NOT NULL,
	"headline" text NOT NULL,
	"summary" text NOT NULL,
	"body" text NOT NULL,
	"key_themes" text[],
	"episode_count" integer NOT NULL,
	"source_episodes" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transcript_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"podcast_name" text NOT NULL,
	"podcast_id" text NOT NULL,
	"episode_title" text NOT NULL,
	"episode_guid" text,
	"taddy_uuid" text,
	"status" text NOT NULL,
	"transcript_length" integer,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"transcript_id" integer,
	"episode_guid" text NOT NULL,
	"podcast_slug" text NOT NULL,
	"episode_slug" text NOT NULL,
	"sequence_index" integer NOT NULL,
	"timestamp_seconds" integer,
	"timestamp_label" text,
	"speaker_name" text,
	"text" text NOT NULL,
	"anchor_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_feature_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"flag_key" text NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "user_feature_overrides_user_flag_unique" UNIQUE("user_id","flag_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"podcasts" text[] NOT NULL,
	"industries" text[] DEFAULT '{}' NOT NULL,
	"interests" text[] DEFAULT '{}' NOT NULL,
	"roles" text[] DEFAULT '{}' NOT NULL,
	"topic_frequencies" jsonb DEFAULT '{}'::jsonb,
	"delivery_time" text DEFAULT '07:00' NOT NULL,
	"delivery_timezone" text DEFAULT 'America/New_York' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"vacation_until" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"signup_source" text,
	"signup_source_detail" text,
	"channel" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"utm_term" text,
	"ip_address" text,
	"user_agent" text,
	"device_type" text,
	"google_id" text,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"birthday" text,
	"gender" text,
	"location" text,
	"language" text,
	"referral_code" text,
	"referred_by" integer,
	"spotify_access_token" text,
	"spotify_refresh_token" text,
	"spotify_token_expires_at" text,
	"created_at" timestamp DEFAULT now(),
	"last_login_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "youtube_review_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" integer NOT NULL,
	"worker_id" integer NOT NULL,
	"action" text NOT NULL,
	"youtube_url" text,
	"spotify_url" text,
	"created_at" timestamp DEFAULT now()
);
