CREATE TABLE "mturk_workers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "mturk_workers_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "youtube_review_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" integer NOT NULL,
	"worker_id" integer NOT NULL,
	"action" text NOT NULL,
	"youtube_url" text,
	"created_at" timestamp DEFAULT now()
);
