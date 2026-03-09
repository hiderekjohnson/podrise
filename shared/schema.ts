import { pgTable, serial, integer, text, timestamp, date, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  podcasts: text("podcasts").array().notNull(),
  deliveryTime: text("delivery_time").notNull().default("07:00"),
  deliveryTimezone: text("delivery_timezone").notNull().default("America/New_York"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: text("plan").notNull().default("free"),
  vacationUntil: text("vacation_until"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
}).extend({
  email: z.string().email("Please enter a valid email address"),
  podcasts: z.array(z.string()).min(1, "Select at least one podcast"),
  deliveryTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format").optional(),
  deliveryTimezone: z.string().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type CreateUserRequest = InsertUser;
export type UpdateUserRequest = Partial<Pick<InsertUser, "email" | "podcasts" | "deliveryTime" | "deliveryTimezone">> & { vacationUntil?: string | null };
export type UserResponse = User;

export const recaps = pgTable("recaps", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  recapDate: date("recap_date").notNull(),
  podcasts: text("podcasts").array().notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRecapSchema = createInsertSchema(recaps).omit({
  id: true,
  createdAt: true,
});

export type InsertRecap = z.infer<typeof insertRecapSchema>;
export type Recap = typeof recaps.$inferSelect;

export const episodeTranscripts = pgTable("episode_transcripts", {
  id: serial("id").primaryKey(),
  podcastId: text("podcast_id").notNull(),
  episodeGuid: text("episode_guid").notNull().unique(),
  episodeTitle: text("episode_title").notNull(),
  transcript: text("transcript").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow(),
});

export type EpisodeTranscript = typeof episodeTranscripts.$inferSelect;

export const emailLogs = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  podcasts: text("podcasts").array().notNull(),
  source: text("source").notNull().default("manual"),
  emailHtml: text("email_html"),
  sentAt: timestamp("sent_at").defaultNow(),
});

export const magicLinks = pgTable("magic_links", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type MagicLink = typeof magicLinks.$inferSelect;

export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({
  id: true,
  sentAt: true,
});

export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailLog = typeof emailLogs.$inferSelect;

export const emailTemplateSettings = pgTable("email_template_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});

export type EmailTemplateSetting = typeof emailTemplateSettings.$inferSelect;

export const pendingEmails = pgTable("pending_emails", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  podcasts: text("podcasts").array().notNull(),
  recapDate: date("recap_date").notNull(),
  summary: text("summary").notNull(),
  emailHtml: text("email_html").notNull(),
  subject: text("subject").notNull(),
  scheduledFor: text("scheduled_for").notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  episodeStats: text("episode_stats"),
  source: text("source").notNull().default("scheduled"),
  status: text("status").notNull().default("pending"),
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  emailOpenedAt: timestamp("email_opened_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PendingEmail = typeof pendingEmails.$inferSelect;
export type InsertPendingEmail = typeof pendingEmails.$inferInsert;

export const transcriptLogs = pgTable("transcript_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  podcastName: text("podcast_name").notNull(),
  podcastId: text("podcast_id").notNull(),
  episodeTitle: text("episode_title").notNull(),
  episodeGuid: text("episode_guid"),
  taddyUuid: text("taddy_uuid"),
  status: text("status").notNull(),
  transcriptLength: integer("transcript_length"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type TranscriptLog = typeof transcriptLogs.$inferSelect;

export const podcastExampleRecaps = pgTable("podcast_example_recaps", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  podcastName: text("podcast_name").notNull(),
  itunesId: text("itunes_id"),
  episodeTitle: text("episode_title").notNull(),
  episodeDate: text("episode_date").notNull(),
  episodeDuration: text("episode_duration"),
  tldl: text("tldl").notNull(),
  whatHappened: text("what_happened").notNull(),
  keyInsights: text("key_insights").array().notNull(),
  quote: text("quote"),
  quoteAttribution: text("quote_attribution"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PodcastExampleRecap = typeof podcastExampleRecaps.$inferSelect;
export type InsertPodcastExampleRecap = typeof podcastExampleRecaps.$inferInsert;

export const landingPageRecaps = pgTable("landing_page_recaps", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(),
  itunesId: text("itunes_id"),
  podcastName: text("podcast_name").notNull(),
  episodeTitle: text("episode_title").notNull(),
  episodeSlug: text("episode_slug").notNull(),
  publishDate: text("publish_date").notNull(),
  duration: text("duration"),
  artworkUrl: text("artwork_url"),
  hosts: text("hosts"),
  tldl: text("tldl").notNull(),
  whatHappened: text("what_happened").notNull(),
  keyInsights: text("key_insights").array().notNull(),
  quote: text("quote"),
  quoteAttribution: text("quote_attribution"),
  appleEpisodeUrl: text("apple_episode_url"),
  audioUrl: text("audio_url"),
  keyTopics: text("key_topics").array(),
  topQuestions: text("top_questions"),
  sponsors: text("sponsors"),
  guests: text("guests"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type LandingPageRecap = typeof landingPageRecaps.$inferSelect;
export type InsertLandingPageRecap = typeof landingPageRecaps.$inferInsert;

export const podcastDirectory = pgTable("podcast_directory", {
  id: serial("id").primaryKey(),
  itunesId: text("itunes_id").notNull().unique(),
  slug: text("slug").unique(),
  name: text("name").notNull(),
  hosts: text("hosts"),
  category: text("category"),
  description: text("description"),
  keywords: text("keywords"),
  faqTopics: text("faq_topics"),
  artworkUrl: text("artwork_url"),
  appleUrl: text("apple_url"),
  spotifyUrl: text("spotify_url"),
  youtubeUrl: text("youtube_url"),
  twitterHandle: text("twitter_handle"),
  hostHandle: text("host_handle"),
  followers: integer("followers"),
  avgEpisodeLength: integer("avg_episode_length"),
  frequency: text("frequency"),
  totalEpisodes: integer("total_episodes"),
  yearStarted: integer("year_started"),
  knownFor: text("known_for").array(),
  hostBios: jsonb("host_bios"),
  relatedSlugs: text("related_slugs").array(),
  aboutPodcast: text("about_podcast"),
  hasLandingPage: boolean("has_landing_page").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const transcriptSegments = pgTable("transcript_segments", {
  id: serial("id").primaryKey(),
  transcriptId: integer("transcript_id"),
  episodeGuid: text("episode_guid").notNull(),
  podcastSlug: text("podcast_slug").notNull(),
  episodeSlug: text("episode_slug").notNull(),
  sequenceIndex: integer("sequence_index").notNull(),
  timestampSeconds: integer("timestamp_seconds"),
  timestampLabel: text("timestamp_label"),
  speakerName: text("speaker_name"),
  text: text("text").notNull(),
  anchorId: text("anchor_id").notNull(),
});

export const insertTranscriptSegmentSchema = createInsertSchema(transcriptSegments).omit({
  id: true,
});

export type TranscriptSegment = typeof transcriptSegments.$inferSelect;
export type InsertTranscriptSegment = z.infer<typeof insertTranscriptSegmentSchema>;

export const insertPodcastDirectorySchema = createInsertSchema(podcastDirectory).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PodcastDirectoryEntry = typeof podcastDirectory.$inferSelect;
export type InsertPodcastDirectoryEntry = z.infer<typeof insertPodcastDirectorySchema>;

export const rssFeeds = pgTable("rss_feeds", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slugKey: text("slug_key").notNull().unique(),
  podcastSlugs: text("podcast_slugs").array().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRssFeedSchema = createInsertSchema(rssFeeds).omit({
  id: true,
  createdAt: true,
});

export type RssFeed = typeof rssFeeds.$inferSelect;
export type InsertRssFeed = z.infer<typeof insertRssFeedSchema>;

export const podcastTopQuestions = pgTable("podcast_top_questions", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  questions: text("questions").notNull(),
  generatedAt: timestamp("generated_at").defaultNow(),
});

export type PodcastTopQuestion = typeof podcastTopQuestions.$inferSelect;

export const podcastHosts = pgTable("podcast_hosts", {
  id: serial("id").primaryKey(),
  podcastSlug: text("podcast_slug").notNull(),
  name: text("name").notNull(),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  twitterHandle: text("twitter_handle"),
  linkedinUrl: text("linkedin_url"),
  instagramHandle: text("instagram_handle"),
  websiteUrl: text("website_url"),
  sortOrder: integer("sort_order").default(0),
});

export const insertPodcastHostSchema = createInsertSchema(podcastHosts).omit({ id: true });
export type InsertPodcastHost = z.infer<typeof insertPodcastHostSchema>;
export type PodcastHost = typeof podcastHosts.$inferSelect;

export const adminSettings = pgTable("admin_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

