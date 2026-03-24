import { pgTable, serial, integer, bigint, text, timestamp, date, boolean, jsonb, real, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  channel: text("channel"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmContent: text("utm_content"),
  utmTerm: text("utm_term"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  deviceType: text("device_type"),
  googleId: text("google_id"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  displayName: text("display_name"),
  birthday: text("birthday"),
  gender: text("gender"),
  location: text("location"),
  language: text("language"),
  referralCode: text("referral_code").unique(),
  referredBy: integer("referred_by"),
  spotifyAccessToken: text("spotify_access_token"),
  spotifyRefreshToken: text("spotify_refresh_token"),
  spotifyTokenExpiresAt: text("spotify_token_expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

export const bookmarks = pgTable("bookmarks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  episodeSlug: text("episode_slug").notNull(),
  podcastSlug: text("podcast_slug").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Bookmark = typeof bookmarks.$inferSelect;
export type InsertBookmark = typeof bookmarks.$inferInsert;

export const bookBookmarks = pgTable("book_bookmarks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  bookSlug: text("book_slug").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueUserBook: unique().on(table.userId, table.bookSlug),
}));

export const insertBookBookmarkSchema = createInsertSchema(bookBookmarks).omit({ id: true, createdAt: true });

export type BookBookmark = typeof bookBookmarks.$inferSelect;
export type InsertBookBookmark = typeof bookBookmarks.$inferInsert;

export const podcastCategories = pgTable("podcast_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  icon: text("icon"),
  keywords: text("keywords").array().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPodcastCategorySchema = createInsertSchema(podcastCategories).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPodcastCategory = z.infer<typeof insertPodcastCategorySchema>;
export type PodcastCategory = typeof podcastCategories.$inferSelect;

export const affiliateClicks = pgTable("affiliate_clicks", {
  id: serial("id").primaryKey(),
  productType: text("product_type").notNull(),
  productName: text("product_name").notNull(),
  productId: integer("product_id"),
  destinationUrl: text("destination_url").notNull(),
  referrerPage: text("referrer_page"),
  userId: integer("user_id"),
  clickedAt: timestamp("clicked_at").defaultNow(),
});

export type AffiliateClick = typeof affiliateClicks.$inferSelect;

export const featureEvents = pgTable("feature_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  feature: text("feature").notNull(),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  check("feature_events_feature_check", sql`${t.feature} IN ('ai_chat', 'episode_link', 'spotify_import')`),
]);

export const insertFeatureEventSchema = createInsertSchema(featureEvents).omit({ id: true, createdAt: true });
export type InsertFeatureEvent = z.infer<typeof insertFeatureEventSchema>;
export type FeatureEvent = typeof featureEvents.$inferSelect;

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull(),
  referredUserId: integer("referred_user_id").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  verifiedAt: timestamp("verified_at"),
});

export type Referral = typeof referrals.$inferSelect;

export const referralTiers = pgTable("referral_tiers", {
  id: serial("id").primaryKey(),
  threshold: integer("threshold").notNull(),
  rewardName: text("reward_name").notNull(),
  rewardDescription: text("reward_description").notNull(),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const insertReferralTierSchema = createInsertSchema(referralTiers).omit({
  id: true,
});

export type ReferralTier = typeof referralTiers.$inferSelect;
export type InsertReferralTier = z.infer<typeof insertReferralTierSchema>;

export const referralFulfillments = pgTable("referral_fulfillments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tierId: integer("tier_id").notNull(),
  tierThreshold: integer("tier_threshold").notNull(),
  status: text("status").notNull().default("unsent"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ReferralFulfillment = typeof referralFulfillments.$inferSelect;

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  lastLoginAt: true,
  emailVerified: true,
  signupSource: true,
  signupSourceDetail: true,
  ipAddress: true,
  userAgent: true,
  deviceType: true,
  googleId: true,
  onboardingCompleted: true,
  referralCode: true,
  referredBy: true,
}).extend({
  email: z.string().email("Please enter a valid email address"),
  podcasts: z.array(z.string()),
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
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  utmTerm: z.string().optional(),
});
export type QuickSubscribeRequest = z.infer<typeof quickSubscribeSchema>;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type CreateUserRequest = InsertUser;
export type UpdateUserRequest = Partial<Pick<InsertUser, "email" | "podcasts" | "deliveryTime" | "deliveryTimezone" | "industries" | "interests" | "roles" | "topicFrequencies">> & { vacationUntil?: string | null; displayName?: string | null; birthday?: string | null; gender?: string | null; location?: string | null; language?: string | null };
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

export const pendingTranscriptQueue = pgTable("pending_transcript_queue", {
  id: serial("id").primaryKey(),
  podcastId: text("podcast_id").notNull(),
  podcastName: text("podcast_name").notNull(),
  episodeGuid: text("episode_guid").notNull(),
  episodeTitle: text("episode_title").notNull(),
  taddyUuid: text("taddy_uuid"),
  priority: integer("priority").notNull().default(50),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  errorMessage: text("error_message"),
  datePublished: integer("date_published"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PendingTranscriptQueueItem = typeof pendingTranscriptQueue.$inferSelect;
export type InsertPendingTranscriptQueueItem = typeof pendingTranscriptQueue.$inferInsert;

export const taddyApiUsage = pgTable("taddy_api_usage", {
  id: serial("id").primaryKey(),
  monthKey: text("month_key").notNull().unique(),
  callCount: integer("call_count").notNull().default(0),
  lastResetAt: timestamp("last_reset_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type TaddyApiUsage = typeof taddyApiUsage.$inferSelect;

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
  youtubeUrl: text("youtube_url"),
  keyTopics: text("key_topics").array(),
  topicContexts: text("topic_contexts"),
  topQuestions: text("top_questions"),
  sponsors: text("sponsors"),
  guests: text("guests"),
  showNotes: text("show_notes"),
  resources: text("resources"),
  published: boolean("published").notNull().default(true),
  status: text("status").notNull().default("published"),
  tabloidHeadline: text("tabloid_headline"),
  tabloidSubHeadline: text("tabloid_sub_headline"),
  episodeGuid: text("episode_guid"),
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
  feedUrl: text("feed_url"),
  taddyUuid: text("taddy_uuid"),
  appleRating: text("apple_rating"),
  appleRatingCount: integer("apple_rating_count"),
  hasLandingPage: boolean("has_landing_page").default(false),
  status: text("status").notNull().default("published"),
  isProtected: boolean("is_protected").default(false),
  dailyEpisodeCap: integer("daily_episode_cap"),
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
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  extractedAt: timestamp("extracted_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const insertExtractedProductSchema = createInsertSchema(extractedProducts).omit({
  id: true,
  approvedBy: true,
  approvedAt: true,
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
  service: text("service").default("openai"),
  podcastSlug: text("podcast_slug"),
  episodeSlug: text("episode_slug"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertApiUsageLogSchema = createInsertSchema(apiUsageLogs).omit({
  id: true,
  createdAt: true,
});

export type ApiUsageLog = typeof apiUsageLogs.$inferSelect;
export type InsertApiUsageLog = z.infer<typeof insertApiUsageLogSchema>;

export const advertisers = pgTable("advertisers", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  link: text("link").default(""),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdvertiserSchema = createInsertSchema(advertisers).omit({
  id: true,
  createdAt: true,
}).extend({
  message: z.string().min(1, "Message is required").max(2000, "Message HTML too long"),
  link: z.string().optional().default(""),
});

export type Advertiser = typeof advertisers.$inferSelect;
export type InsertAdvertiser = z.infer<typeof insertAdvertiserSchema>;

export const deviceTokens = pgTable("device_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceToken: text("device_token").notNull().unique(),
  platform: text("platform").notNull().default("ios"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type DeviceToken = typeof deviceTokens.$inferSelect;
export type InsertDeviceToken = typeof deviceTokens.$inferInsert;

export const refreshTokens = pgTable("refresh_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type InsertRefreshToken = typeof refreshTokens.$inferInsert;

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: text("role").notNull().default("admin"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({
  id: true,
  createdAt: true,
}).extend({
  email: z.string().email("Must be a valid email"),
  name: z.string().optional(),
  role: z.enum(["owner", "admin"]).default("admin"),
});

export type AdminUser = typeof adminUsers.$inferSelect;
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;

export const errorLogs = pgTable("error_logs", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull(),
  httpStatus: integer("http_status").notNull().default(500),
  errorMessage: text("error_message").notNull(),
  friendlySummary: text("friendly_summary").notNull(),
  severity: text("severity").notNull().default("error"),
  method: text("method"),
  userAgent: text("user_agent"),
  userId: integer("user_id"),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  firstOccurredAt: timestamp("first_occurred_at").defaultNow(),
  lastOccurredAt: timestamp("last_occurred_at").defaultNow(),
});

export const insertErrorLogSchema = createInsertSchema(errorLogs).omit({
  id: true,
  occurrenceCount: true,
  firstOccurredAt: true,
  lastOccurredAt: true,
});

export type ErrorLog = typeof errorLogs.$inferSelect;
export type InsertErrorLog = z.infer<typeof insertErrorLogSchema>;

export const pulseSubscriptions = pgTable("pulse_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  topicSlug: text("topic_slug").notNull(),
  subscribedAt: timestamp("subscribed_at").defaultNow(),
}, (table) => ({
  userTopicUnique: unique("pulse_subscriptions_user_topic_unique").on(table.userId, table.topicSlug),
}));

export const insertPulseSubscriptionSchema = createInsertSchema(pulseSubscriptions).omit({
  id: true,
  subscribedAt: true,
});

export type PulseSubscription = typeof pulseSubscriptions.$inferSelect;
export type InsertPulseSubscription = z.infer<typeof insertPulseSubscriptionSchema>;

export const supportArticles = pgTable("support_articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  body: text("body").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSupportArticleSchema = createInsertSchema(supportArticles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string().min(1, "Title is required").max(200),
  category: z.string().min(1, "Category is required").max(100),
  body: z.string().min(1, "Body is required").max(10000),
  sortOrder: z.number().int().min(0).optional().default(0),
  active: z.boolean().optional().default(true),
});

export type SupportArticle = typeof supportArticles.$inferSelect;
export type InsertSupportArticle = z.infer<typeof insertSupportArticleSchema>;

export const entityPeople = pgTable("entity_people", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  title: text("title"),
  company: text("company"),
  twitterHandle: text("twitter_handle"),
  linkedinUrl: text("linkedin_url"),
  websiteUrl: text("website_url"),
  category: text("category"),
  searchTerms: text("search_terms").array().notNull().default([]),
  hostedSlugs: text("hosted_slugs").array().notNull().default([]),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEntityPersonSchema = createInsertSchema(entityPeople).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type EntityPerson = typeof entityPeople.$inferSelect;
export type InsertEntityPerson = z.infer<typeof insertEntityPersonSchema>;

export const entityCompanies = pgTable("entity_companies", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  industry: text("industry"),
  websiteUrl: text("website_url"),
  twitterHandle: text("twitter_handle"),
  category: text("category"),
  searchTerms: text("search_terms").array().notNull().default([]),
  associatedTerms: text("associated_terms").array().notNull().default([]),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEntityCompanySchema = createInsertSchema(entityCompanies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type EntityCompany = typeof entityCompanies.$inferSelect;
export type InsertEntityCompany = z.infer<typeof insertEntityCompanySchema>;

export const entityEpisodeMentions = pgTable("entity_episode_mentions", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entitySlug: text("entity_slug").notNull(),
  recapId: integer("recap_id").notNull(),
  episodeSlug: text("episode_slug").notNull(),
  podcastSlug: text("podcast_slug").notNull(),
  context: text("context"),
  mentionCount: integer("mention_count").default(1),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  entityEpisodeUnique: unique("entity_episode_unique").on(table.entityType, table.entitySlug, table.recapId),
}));

export const insertEntityEpisodeMentionSchema = createInsertSchema(entityEpisodeMentions).omit({
  id: true,
  createdAt: true,
});

export type EntityEpisodeMention = typeof entityEpisodeMentions.$inferSelect;
export type InsertEntityEpisodeMention = z.infer<typeof insertEntityEpisodeMentionSchema>;

export const feedAds = pgTable("feed_ads", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  destinationUrl: text("destination_url").default(""),
  podcastSlug: text("podcast_slug"),
  episodeSlug: text("episode_slug"),
  episodeTitle: text("episode_title"),
  episodeTldl: text("episode_tldl"),
  episodeKeyInsights: text("episode_key_insights").array(),
  episodeQuote: text("episode_quote"),
  episodeQuoteAttribution: text("episode_quote_attribution"),
  podcastName: text("podcast_name"),
  weight: integer("weight").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const baseFeedAdSchema = createInsertSchema(feedAds).omit({
  id: true,
  createdAt: true,
}).extend({
  type: z.enum(["podcast", "regular", "episode_recap"]),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().min(1, "Description is required").max(1000),
  imageUrl: z.string().min(1, "Image URL is required"),
  destinationUrl: z.string().refine((val) => !val || /^https?:\/\//.test(val), { message: "URL must start with http:// or https://" }).optional().default(""),
  podcastSlug: z.string().nullable().optional(),
  episodeSlug: z.string().nullable().optional(),
  episodeTitle: z.string().nullable().optional(),
  episodeTldl: z.string().nullable().optional(),
  episodeKeyInsights: z.array(z.string()).nullable().optional(),
  episodeQuote: z.string().nullable().optional(),
  episodeQuoteAttribution: z.string().nullable().optional(),
  podcastName: z.string().nullable().optional(),
  weight: z.number().int().min(1).max(10).default(1),
  isActive: z.boolean().default(true),
});

export const insertFeedAdSchema = baseFeedAdSchema.refine((data) => {
  if (data.type === "podcast" && (!data.podcastSlug || data.podcastSlug.trim() === "")) return false;
  return true;
}, { message: "Podcast slug is required for podcast ads", path: ["podcastSlug"] }).refine((data) => {
  if (data.type === "regular" && (!data.destinationUrl || data.destinationUrl.trim() === "")) return false;
  return true;
}, { message: "Destination URL is required for regular ads", path: ["destinationUrl"] }).refine((data) => {
  if (data.type === "episode_recap" && (!data.podcastSlug || data.podcastSlug.trim() === "")) return false;
  return true;
}, { message: "Podcast slug is required for episode recap ads", path: ["podcastSlug"] }).refine((data) => {
  if (data.type === "episode_recap" && (!data.episodeSlug || data.episodeSlug.trim() === "")) return false;
  return true;
}, { message: "Episode slug is required for episode recap ads", path: ["episodeSlug"] });

export type FeedAd = typeof feedAds.$inferSelect;
export type InsertFeedAd = z.infer<typeof insertFeedAdSchema>;

export const feedAdSettings = pgTable("feed_ad_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});

export type FeedAdSetting = typeof feedAdSettings.$inferSelect;

export const landingPageVisits = pgTable("landing_page_visits", {
  id: serial("id").primaryKey(),
  pageSlug: text("page_slug").notNull(),
  sessionId: text("session_id"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmContent: text("utm_content"),
  utmTerm: text("utm_term"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  deviceType: text("device_type"),
  userId: integer("user_id"),
  visitedAt: timestamp("visited_at").defaultNow(),
});

export const insertLandingPageVisitSchema = createInsertSchema(landingPageVisits).omit({ id: true, visitedAt: true });
export type InsertLandingPageVisit = z.infer<typeof insertLandingPageVisitSchema>;
export type LandingPageVisit = typeof landingPageVisits.$inferSelect;

export const featureFlags = pgTable("feature_flags", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFeatureFlagSchema = createInsertSchema(featureFlags).omit({
  id: true,
  createdAt: true,
}).extend({
  key: z.string().min(1, "Key is required").max(100).regex(/^[a-z0-9_-]+$/, "Key must be lowercase alphanumeric with dashes/underscores"),
  description: z.string().max(500).optional(),
  enabled: z.boolean().default(false),
});

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;

export const userFeatureOverrides = pgTable("user_feature_overrides", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  flagKey: text("flag_key").notNull(),
  enabled: boolean("enabled").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userFlagUnique: unique("user_feature_overrides_user_flag_unique").on(table.userId, table.flagKey),
}));

export const insertUserFeatureOverrideSchema = createInsertSchema(userFeatureOverrides).omit({
  id: true,
  createdAt: true,
});

export type UserFeatureOverride = typeof userFeatureOverrides.$inferSelect;
export type InsertUserFeatureOverride = z.infer<typeof insertUserFeatureOverrideSchema>;

export const adEvents = pgTable("ad_events", {
  id: serial("id").primaryKey(),
  adId: integer("ad_id").notNull(),
  eventType: text("event_type").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AdEvent = typeof adEvents.$inferSelect;
export type InsertAdEvent = typeof adEvents.$inferInsert;

export const siteSettings = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SiteSetting = typeof siteSettings.$inferSelect;

export const conversionEventSchema = z.object({
  pagePath: z.string().min(1),
  eventName: z.string().min(1),
});

export type ConversionEvent = z.infer<typeof conversionEventSchema>;

export const pixelSettingsSchema = z.object({
  verificationTags: z.string().optional().default(""),
  pixels: z.object({
    facebook: z.string().optional().default(""),
    tiktok: z.string().optional().default(""),
    googleAds: z.string().optional().default(""),
    twitter: z.string().optional().default(""),
    linkedin: z.string().optional().default(""),
    pinterest: z.string().optional().default(""),
    snapchat: z.string().optional().default(""),
    custom: z.string().optional().default(""),
  }).optional().default({}),
  conversionEvents: z.array(conversionEventSchema).optional().default([]),
});

export type PixelSettings = z.infer<typeof pixelSettingsSchema>;

export const mturkWorkers = pgTable("mturk_workers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  token: text("token").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMturkWorkerSchema = createInsertSchema(mturkWorkers).omit({ id: true, createdAt: true });
export type InsertMturkWorker = z.infer<typeof insertMturkWorkerSchema>;
export type MturkWorker = typeof mturkWorkers.$inferSelect;

export const youtubeReviewLog = pgTable("youtube_review_log", {
  id: serial("id").primaryKey(),
  episodeId: integer("episode_id").notNull(),
  workerId: integer("worker_id").notNull(),
  action: text("action").notNull(),
  youtubeUrl: text("youtube_url"),
  spotifyUrl: text("spotify_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertYoutubeReviewLogSchema = createInsertSchema(youtubeReviewLog).omit({ id: true, createdAt: true });
export type InsertYoutubeReviewLog = z.infer<typeof insertYoutubeReviewLogSchema>;
export type YoutubeReviewLog = typeof youtubeReviewLog.$inferSelect;

export const recapAudio = pgTable("recap_audio", {
  id: serial("id").primaryKey(),
  podcastSlug: text("podcast_slug").notNull(),
  episodeSlug: text("episode_slug").notNull(),
  audioUrl: text("audio_url"),
  elevenlabsRequestId: text("elevenlabs_request_id"),
  voiceId: text("voice_id"),
  characterCount: integer("character_count").default(0),
  audioDuration: real("audio_duration").default(0),
  openaiScriptCost: real("openai_script_cost").default(0),
  elevenlabsCost: real("elevenlabs_cost").default(0),
  totalCost: real("total_cost").default(0),
  narrationScript: text("narration_script"),
  status: text("status").notNull().default("not_generated"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRecapAudioSchema = createInsertSchema(recapAudio).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRecapAudio = z.infer<typeof insertRecapAudioSchema>;
export type RecapAudio = typeof recapAudio.$inferSelect;

export const audioPlaybackEvents = pgTable("audio_playback_events", {
  id: serial("id").primaryKey(),
  podcastSlug: text("podcast_slug").notNull(),
  episodeSlug: text("episode_slug").notNull(),
  eventType: text("event_type").notNull(),
  percentageReached: real("percentage_reached").default(0),
  sessionId: text("session_id"),
  userId: integer("user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAudioPlaybackEventSchema = createInsertSchema(audioPlaybackEvents).omit({ id: true, createdAt: true });
export type InsertAudioPlaybackEvent = z.infer<typeof insertAudioPlaybackEventSchema>;
export type AudioPlaybackEvent = typeof audioPlaybackEvents.$inferSelect;

export const alertSubscriptions = pgTable("alert_subscriptions", {
  id: serial("id").primaryKey(),
  alertType: text("alert_type").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  emails: text("emails").array().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAlertSubscriptionSchema = createInsertSchema(alertSubscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAlertSubscription = z.infer<typeof insertAlertSubscriptionSchema>;
export type AlertSubscription = typeof alertSubscriptions.$inferSelect;

export const backfillJobs = pgTable("backfill_jobs", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  status: text("status").notNull().default("idle"),
  totalRecords: integer("total_records"),
  processedCount: integer("processed_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  errorMessage: text("error_message"),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBackfillJobSchema = createInsertSchema(backfillJobs).omit({ id: true, createdAt: true });
export type InsertBackfillJob = z.infer<typeof insertBackfillJobSchema>;
export type BackfillJob = typeof backfillJobs.$inferSelect;

export const webhookEvents = pgTable("webhook_events", {
  id: serial("id").primaryKey(),
  receivedAt: timestamp("received_at").defaultNow(),
  taddyType: text("taddy_type"),
  action: text("action"),
  episodeUuid: text("episode_uuid"),
  episodeTitle: text("episode_title"),
  podcastName: text("podcast_name"),
  podcastId: text("podcast_id"),
  outcome: text("outcome"),
  outcomeDetail: text("outcome_detail"),
  datePublished: bigint("date_published", { mode: "number" }),
  rawPayload: jsonb("raw_payload"),
});
export type WebhookEvent = typeof webhookEvents.$inferSelect;

