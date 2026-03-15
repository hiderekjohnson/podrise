import { pgTable, serial, integer, text, timestamp, date, boolean, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  podcasts: text("podcasts").array().notNull(),
  industries: text("industries").array().notNull().default([]),
  interests: text("interests").array().notNull().default([]),
  roles: text("roles").array().notNull().default([]),
  topicFrequencies: jsonb("topic_frequencies").default({}),
  deliveryTime: text("delivery_time").notNull().default("07:00"),
  deliveryTimezone: text("delivery_timezone").notNull().default("America/New_York"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: text("plan").notNull().default("free"),
  vacationUntil: text("vacation_until"),
  emailVerified: boolean("email_verified").notNull().default(false),
  signupSource: text("signup_source"),
  signupSourceDetail: text("signup_source_detail"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  deviceType: text("device_type"),
  googleId: text("google_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const affiliateClicks = pgTable("affiliate_clicks", {
  id: serial("id").primaryKey(),
  productType: text("product_type").notNull(),
  productName: text("product_name").notNull(),
  productId: integer("product_id"),
  destinationUrl: text("destination_url").notNull(),
  referrerPage: text("referrer_page"),
  clickedAt: timestamp("clicked_at").defaultNow(),
});

export type AffiliateClick = typeof affiliateClicks.$inferSelect;

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  emailVerified: true,
  signupSource: true,
  signupSourceDetail: true,
  ipAddress: true,
  userAgent: true,
  deviceType: true,
  googleId: true,
}).extend({
  email: z.string().email("Please enter a valid email address"),
  podcasts: z.array(z.string()).min(1, "Select at least one podcast"),
  deliveryTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format").optional(),
  deliveryTimezone: z.string().optional(),
  industries: z.array(z.string()).optional(),
  interests: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
  topicFrequencies: z.record(z.string(), z.enum(["daily", "weekly"])).optional(),
});

export const quickSubscribeSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  type: z.enum(["podcast", "industry", "interest", "role"]),
  slug: z.string().min(1),
  name: z.string().optional(),
});
export type QuickSubscribeRequest = z.infer<typeof quickSubscribeSchema>;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type CreateUserRequest = InsertUser;
export type UpdateUserRequest = Partial<Pick<InsertUser, "email" | "podcasts" | "deliveryTime" | "deliveryTimezone" | "industries" | "interests" | "roles" | "topicFrequencies">> & { vacationUntil?: string | null };
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
  description: text("description"),
  subtitle: text("subtitle"),
  datePublished: integer("date_published"),
  duration: integer("duration"),
  audioUrl: text("audio_url"),
  imageUrl: text("image_url"),
  seasonNumber: integer("season_number"),
  episodeNumber: integer("episode_number"),
  episodeType: text("episode_type"),
  completeRecord: boolean("complete_record").default(false),
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
  firstClickedAt: timestamp("first_clicked_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PendingEmail = typeof pendingEmails.$inferSelect;
export type InsertPendingEmail = typeof pendingEmails.$inferInsert;

export const emailClicks = pgTable("email_clicks", {
  id: serial("id").primaryKey(),
  emailId: integer("email_id").notNull(),
  url: text("url").notNull(),
  clickedAt: timestamp("clicked_at").defaultNow(),
});

export type EmailClick = typeof emailClicks.$inferSelect;

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
  spotifyEpisodeUrl: text("spotify_episode_url"),
  audioUrl: text("audio_url"),
  keyTopics: text("key_topics").array(),
  topicContexts: text("topic_contexts"),
  topQuestions: text("top_questions"),
  sponsors: text("sponsors"),
  guests: text("guests"),
  showNotes: text("show_notes"),
  resources: text("resources"),
  published: boolean("published").notNull().default(true),
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
  instagramUrl: text("instagram_url"),
  tiktokUrl: text("tiktok_url"),
  facebookUrl: text("facebook_url"),
  discordUrl: text("discord_url"),
  websiteUrl: text("website_url"),
  storeUrl: text("store_url"),
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
  taddyUuid: text("taddy_uuid"),
  appleRating: text("apple_rating"),
  appleRatingCount: integer("apple_rating_count"),
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

export const dailyDropEditions = pgTable("daily_drop_editions", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),
  headline: text("headline").notNull(),
  subheadline: text("subheadline"),
  body: text("body").notNull(),
  episodeSlugs: text("episode_slugs").array(),
  generatedAt: timestamp("generated_at").defaultNow(),
});

export type DailyDropEdition = typeof dailyDropEditions.$inferSelect;

export const podcasterClaims = pgTable("podcaster_claims", {
  id: serial("id").primaryKey(),
  podcastSlug: text("podcast_slug").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  verified: boolean("verified").notNull().default(false),
  customBylineText: text("custom_byline_text"),
  customBylineUrl: text("custom_byline_url"),
  customBylineLabel: text("custom_byline_label"),
  customSponsors: text("custom_sponsors"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPodcasterClaimSchema = createInsertSchema(podcasterClaims).omit({
  id: true,
  verified: true,
  createdAt: true,
});

export type PodcasterClaim = typeof podcasterClaims.$inferSelect;
export type InsertPodcasterClaim = z.infer<typeof insertPodcasterClaimSchema>;

export const episodeQuotes = pgTable("episode_quotes", {
  id: serial("id").primaryKey(),
  podcastSlug: text("podcast_slug").notNull(),
  episodeSlug: text("episode_slug").notNull(),
  speakerName: text("speaker_name").notNull(),
  speakerRole: text("speaker_role"),
  quoteText: text("quote_text").notNull(),
  context: text("context").notNull(),
  quoteType: text("quote_type").notNull(),
  sortOrder: serial("sort_order"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEpisodeQuoteSchema = createInsertSchema(episodeQuotes).omit({
  id: true,
  sortOrder: true,
  createdAt: true,
});

export type EpisodeQuote = typeof episodeQuotes.$inferSelect;
export type InsertEpisodeQuote = z.infer<typeof insertEpisodeQuoteSchema>;

export const extractedProducts = pgTable("extracted_products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  description: text("description"),
  purchaseUrl: text("purchase_url"),
  imageUrl: text("image_url"),
  context: text("context"),
  contextSummary: text("context_summary"),
  mentionType: text("mention_type"),
  category: text("category").notNull().default("physical_product"),
  episodeTitle: text("episode_title").notNull(),
  episodeSlug: text("episode_slug"),
  podcastSlug: text("podcast_slug").notNull().default("myfirstmillion"),
  status: text("status").notNull().default("pending"),
  imageStatus: text("image_status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  extractedAt: timestamp("extracted_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const insertExtractedProductSchema = createInsertSchema(extractedProducts).omit({
  id: true,
  extractedAt: true,
  reviewedAt: true,
});

export type ExtractedProduct = typeof extractedProducts.$inferSelect;
export type InsertExtractedProduct = z.infer<typeof insertExtractedProductSchema>;

export const productPodcastBuzz = pgTable("product_podcast_buzz", {
  id: serial("id").primaryKey(),
  productKey: text("product_key").notNull().unique(),
  productName: text("product_name").notNull(),
  company: text("company"),
  podcastBuzz: text("podcast_buzz").notNull(),
  generatedAt: timestamp("generated_at").defaultNow(),
});

export type ProductPodcastBuzz = typeof productPodcastBuzz.$inferSelect;

export const topicPulses = pgTable("topic_pulses", {
  id: serial("id").primaryKey(),
  topicSlug: text("topic_slug").notNull(),
  publishDate: text("publish_date").notNull(),
  headline: text("headline").notNull(),
  summary: text("summary").notNull(),
  body: text("body").notNull(),
  keyThemes: text("key_themes").array(),
  episodeCount: integer("episode_count").notNull(),
  sourceEpisodes: jsonb("source_episodes").notNull(),
  generatedAt: timestamp("generated_at").defaultNow(),
});

export const insertTopicPulseSchema = createInsertSchema(topicPulses).omit({
  id: true,
  generatedAt: true,
});

export type TopicPulse = typeof topicPulses.$inferSelect;
export type InsertTopicPulse = z.infer<typeof insertTopicPulseSchema>;

export const apiUsageLogs = pgTable("api_usage_logs", {
  id: serial("id").primaryKey(),
  model: text("model").notNull(),
  feature: text("feature").notNull(),
  promptTokens: integer("prompt_tokens").default(0),
  completionTokens: integer("completion_tokens").default(0),
  totalTokens: integer("total_tokens").default(0),
  estimatedCost: real("estimated_cost").default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertApiUsageLogSchema = createInsertSchema(apiUsageLogs).omit({
  id: true,
  createdAt: true,
});

export type ApiUsageLog = typeof apiUsageLogs.$inferSelect;
export type InsertApiUsageLog = z.infer<typeof insertApiUsageLogSchema>;

