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
