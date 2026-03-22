CREATE TABLE "feature_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "feature_flags_key_unique" UNIQUE("key")
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
