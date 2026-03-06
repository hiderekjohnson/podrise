import { pgTable, serial, integer, text, timestamp, date } from "drizzle-orm/pg-core";
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
export type UpdateUserRequest = Partial<Pick<InsertUser, "email" | "podcasts" | "deliveryTime" | "deliveryTimezone">>;
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
  source: text("source").notNull().default("scheduled"),
  status: text("status").notNull().default("pending"),
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
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
