import { db } from "./db";
import { users, recaps, episodeTranscripts, emailLogs, magicLinks, emailTemplateSettings, transcriptLogs, pendingEmails, podcastExampleRecaps, type CreateUserRequest, type UpdateUserRequest, type UserResponse, type Recap, type InsertRecap, type EpisodeTranscript, type EmailLog, type InsertEmailLog, type MagicLink, type TranscriptLog, type PendingEmail, type InsertPendingEmail, type PodcastExampleRecap, type InsertPodcastExampleRecap } from "@shared/schema";
import { eq, desc, sql, and, gt, isNull } from "drizzle-orm";

export interface IStorage {
  createUser(user: CreateUserRequest): Promise<UserResponse>;
  getUserByEmail(email: string): Promise<UserResponse | undefined>;
  getUserById(id: number): Promise<UserResponse | undefined>;
  updateUser(id: number, updates: UpdateUserRequest): Promise<UserResponse>;
  updateUserStripeInfo(id: number, info: { stripeCustomerId?: string; stripeSubscriptionId?: string; plan?: string }): Promise<UserResponse>;
  getUserByStripeCustomerId(customerId: string): Promise<UserResponse | undefined>;
  getRecapsByUserId(userId: number): Promise<Recap[]>;
  createRecap(recap: InsertRecap): Promise<Recap>;
  getAllUsers(): Promise<UserResponse[]>;
  getSubscription(subscriptionId: string): Promise<any>;
  getTranscriptByEpisodeGuid(episodeGuid: string): Promise<EpisodeTranscript | undefined>;
  saveTranscript(data: { podcastId: string; episodeGuid: string; episodeTitle: string; transcript: string }): Promise<EpisodeTranscript>;
  logEmail(data: InsertEmailLog): Promise<EmailLog>;
  getEmailLogs(): Promise<EmailLog[]>;
  hasEmailLogForUserOnDate(userId: number, date: string): Promise<boolean>;
  createMagicLink(email: string, token: string, expiresAt: Date): Promise<MagicLink>;
  getMagicLinkByToken(token: string): Promise<MagicLink | undefined>;
  markMagicLinkUsed(id: number): Promise<void>;
  deleteUser(id: number): Promise<void>;
  getAllRecaps(): Promise<Recap[]>;
  getTopPodcasts(limit?: number): Promise<{ id: string; name: string; artworkUrl: string; userCount: number }[]>;
  getEmailTemplateSettings(): Promise<Record<string, string>>;
  setEmailTemplateSetting(key: string, value: string): Promise<void>;
  setEmailTemplateSettings(settings: Record<string, string>): Promise<void>;
  logTranscriptEvent(data: { userId?: number; podcastName: string; podcastId: string; episodeTitle: string; episodeGuid?: string; taddyUuid?: string; status: string; transcriptLength?: number; errorMessage?: string }): Promise<TranscriptLog>;
  getTranscriptLogs(limit?: number): Promise<TranscriptLog[]>;
  getTranscriptById(id: number): Promise<EpisodeTranscript | undefined>;
  createPendingEmail(data: InsertPendingEmail): Promise<PendingEmail>;
  getPendingEmails(status?: string): Promise<PendingEmail[]>;
  getPendingEmailById(id: number): Promise<PendingEmail | undefined>;
  updatePendingEmailStatus(id: number, status: string, errorMessage?: string): Promise<PendingEmail>;
  updatePendingEmailHtml(id: number, emailHtml: string): Promise<PendingEmail>;
  updatePendingEmailSummary(id: number, summary: string): Promise<PendingEmail>;
  markEmailOpened(id: number): Promise<void>;
  getPendingEmailsForUser(userId: number, recapDate: string): Promise<PendingEmail[]>;
  deletePendingEmail(id: number): Promise<void>;
  clearOldPendingEmails(daysOld: number): Promise<number>;
  getExampleRecap(slug: string): Promise<PodcastExampleRecap | undefined>;
  upsertExampleRecap(data: InsertPodcastExampleRecap): Promise<PodcastExampleRecap>;
  getAllExampleRecaps(): Promise<PodcastExampleRecap[]>;
  getRecentTranscripts(limit?: number): Promise<EpisodeTranscript[]>;
}

export class DatabaseStorage implements IStorage {
  async createUser(insertUser: CreateUserRequest): Promise<UserResponse> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getUserByEmail(email: string): Promise<UserResponse | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    return user ?? undefined;
  }

  async getUserById(id: number): Promise<UserResponse | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id));
    return user ?? undefined;
  }

  async updateUser(id: number, updates: UpdateUserRequest): Promise<UserResponse> {
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async getRecapsByUserId(userId: number): Promise<Recap[]> {
    return db
      .select()
      .from(recaps)
      .where(eq(recaps.userId, userId))
      .orderBy(desc(recaps.recapDate));
  }

  async createRecap(recap: InsertRecap): Promise<Recap> {
    const [created] = await db
      .insert(recaps)
      .values(recap)
      .returning();
    return created;
  }

  async updateUserStripeInfo(id: number, info: { stripeCustomerId?: string; stripeSubscriptionId?: string; plan?: string }): Promise<UserResponse> {
    const [updated] = await db
      .update(users)
      .set(info)
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async getUserByStripeCustomerId(customerId: string): Promise<UserResponse | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.stripeCustomerId, customerId));
    return user ?? undefined;
  }

  async getSubscription(subscriptionId: string): Promise<any> {
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`
    );
    return result.rows[0] || null;
  }

  async getTranscriptByEpisodeGuid(episodeGuid: string): Promise<EpisodeTranscript | undefined> {
    const [transcript] = await db
      .select()
      .from(episodeTranscripts)
      .where(eq(episodeTranscripts.episodeGuid, episodeGuid));
    return transcript ?? undefined;
  }

  async saveTranscript(data: { podcastId: string; episodeGuid: string; episodeTitle: string; transcript: string }): Promise<EpisodeTranscript> {
    const [created] = await db
      .insert(episodeTranscripts)
      .values(data)
      .onConflictDoUpdate({
        target: episodeTranscripts.episodeGuid,
        set: { transcript: data.transcript, fetchedAt: new Date() },
      })
      .returning();
    return created;
  }

  async getAllUsers(): Promise<UserResponse[]> {
    return db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt));
  }

  async logEmail(data: InsertEmailLog): Promise<EmailLog> {
    const [log] = await db
      .insert(emailLogs)
      .values(data)
      .returning();
    return log;
  }

  async getEmailLogs(): Promise<EmailLog[]> {
    return db
      .select()
      .from(emailLogs)
      .orderBy(desc(emailLogs.sentAt))
      .limit(500);
  }

  async hasEmailLogForUserOnDate(userId: number, date: string): Promise<boolean> {
    const dayStart = new Date(date + "T00:00:00.000Z");
    const dayEnd = new Date(date + "T23:59:59.999Z");
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailLogs)
      .where(
        and(
          eq(emailLogs.userId, userId),
          gt(emailLogs.sentAt, dayStart),
          sql`${emailLogs.sentAt} <= ${dayEnd}`
        )
      );
    return (row?.count ?? 0) > 0;
  }
  async deleteUser(id: number): Promise<void> {
    await db.delete(recaps).where(eq(recaps.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  async getAllRecaps(): Promise<Recap[]> {
    return await db.select().from(recaps).orderBy(desc(recaps.createdAt));
  }

  async createMagicLink(email: string, token: string, expiresAt: Date): Promise<MagicLink> {
    const [link] = await db
      .insert(magicLinks)
      .values({ email, token, expiresAt })
      .returning();
    return link;
  }

  async getMagicLinkByToken(token: string): Promise<MagicLink | undefined> {
    const [link] = await db
      .select()
      .from(magicLinks)
      .where(
        and(
          eq(magicLinks.token, token),
          gt(magicLinks.expiresAt, new Date()),
          isNull(magicLinks.usedAt)
        )
      );
    return link ?? undefined;
  }

  async markMagicLinkUsed(id: number): Promise<void> {
    await db
      .update(magicLinks)
      .set({ usedAt: new Date() })
      .where(eq(magicLinks.id, id));
  }

  async getTopPodcasts(limit = 50): Promise<{ id: string; name: string; artworkUrl: string; userCount: number }[]> {
    const allUsers = await db.select({ podcasts: users.podcasts }).from(users);
    const counts = new Map<string, { id: string; name: string; artworkUrl: string; count: number }>();

    for (const user of allUsers) {
      for (const raw of user.podcasts) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.id && parsed.name && parsed.artworkUrl && parsed.artworkUrl.includes("mzstatic.com/")) {
            const existing = counts.get(parsed.id);
            if (existing) {
              existing.count++;
            } else {
              counts.set(parsed.id, {
                id: parsed.id,
                name: parsed.name,
                artworkUrl: parsed.artworkUrl || "",
                count: 1,
              });
            }
          }
        } catch {}
      }
    }

    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((p) => ({ id: p.id, name: p.name, artworkUrl: p.artworkUrl, userCount: p.count }));
  }
  async getEmailTemplateSettings(): Promise<Record<string, string>> {
    const rows = await db.select().from(emailTemplateSettings);
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  async setEmailTemplateSetting(key: string, value: string): Promise<void> {
    await db
      .insert(emailTemplateSettings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: emailTemplateSettings.key,
        set: { value },
      });
  }

  async setEmailTemplateSettings(settings: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.setEmailTemplateSetting(key, value);
    }
  }

  async logTranscriptEvent(data: { userId?: number; podcastName: string; podcastId: string; episodeTitle: string; episodeGuid?: string; taddyUuid?: string; status: string; transcriptLength?: number; errorMessage?: string }): Promise<TranscriptLog> {
    const [log] = await db
      .insert(transcriptLogs)
      .values({
        userId: data.userId ?? null,
        podcastName: data.podcastName,
        podcastId: data.podcastId,
        episodeTitle: data.episodeTitle,
        episodeGuid: data.episodeGuid ?? null,
        taddyUuid: data.taddyUuid ?? null,
        status: data.status,
        transcriptLength: data.transcriptLength ?? null,
        errorMessage: data.errorMessage ?? null,
      })
      .returning();
    return log;
  }

  async getTranscriptLogs(limit = 200): Promise<TranscriptLog[]> {
    return db.select().from(transcriptLogs).orderBy(desc(transcriptLogs.id)).limit(limit);
  }

  async getTranscriptById(id: number): Promise<EpisodeTranscript | undefined> {
    const [t] = await db.select().from(episodeTranscripts).where(eq(episodeTranscripts.id, id));
    return t;
  }

  async createPendingEmail(data: InsertPendingEmail): Promise<PendingEmail> {
    const [created] = await db.insert(pendingEmails).values(data).returning();
    return created;
  }

  async getPendingEmails(status?: string): Promise<PendingEmail[]> {
    if (status) {
      return db.select().from(pendingEmails).where(eq(pendingEmails.status, status)).orderBy(desc(pendingEmails.createdAt)).limit(500);
    }
    return db.select().from(pendingEmails).orderBy(desc(pendingEmails.createdAt)).limit(500);
  }

  async getPendingEmailById(id: number): Promise<PendingEmail | undefined> {
    const [row] = await db.select().from(pendingEmails).where(eq(pendingEmails.id, id));
    return row ?? undefined;
  }

  async updatePendingEmailStatus(id: number, status: string, errorMessage?: string): Promise<PendingEmail> {
    const updates: any = { status };
    if (status === "sent") updates.sentAt = new Date();
    if (errorMessage) updates.errorMessage = errorMessage;
    const [updated] = await db.update(pendingEmails).set(updates).where(eq(pendingEmails.id, id)).returning();
    return updated;
  }

  async updatePendingEmailHtml(id: number, emailHtml: string): Promise<PendingEmail> {
    const [updated] = await db.update(pendingEmails).set({ emailHtml }).where(eq(pendingEmails.id, id)).returning();
    return updated;
  }

  async updatePendingEmailSummary(id: number, summary: string): Promise<PendingEmail> {
    const [updated] = await db.update(pendingEmails).set({ summary }).where(eq(pendingEmails.id, id)).returning();
    return updated;
  }

  async markEmailOpened(id: number): Promise<void> {
    await db.update(pendingEmails)
      .set({ emailOpenedAt: new Date() })
      .where(and(eq(pendingEmails.id, id), isNull(pendingEmails.emailOpenedAt)));
  }

  async getPendingEmailsForUser(userId: number, recapDate: string): Promise<PendingEmail[]> {
    return db.select().from(pendingEmails).where(
      and(eq(pendingEmails.userId, userId), eq(pendingEmails.recapDate, recapDate))
    );
  }

  async deletePendingEmail(id: number): Promise<void> {
    await db.delete(pendingEmails).where(eq(pendingEmails.id, id));
  }

  async clearOldPendingEmails(daysOld: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    const result = await db.delete(pendingEmails).where(
      and(
        sql`${pendingEmails.createdAt} < ${cutoff}`,
        sql`${pendingEmails.status} IN ('sent', 'cancelled')`
      )
    ).returning();
    return result.length;
  }
  async getExampleRecap(slug: string): Promise<PodcastExampleRecap | undefined> {
    const [recap] = await db.select().from(podcastExampleRecaps).where(eq(podcastExampleRecaps.slug, slug));
    return recap;
  }

  async upsertExampleRecap(data: InsertPodcastExampleRecap): Promise<PodcastExampleRecap> {
    const [result] = await db
      .insert(podcastExampleRecaps)
      .values(data)
      .onConflictDoUpdate({
        target: podcastExampleRecaps.slug,
        set: {
          podcastName: data.podcastName,
          itunesId: data.itunesId,
          episodeTitle: data.episodeTitle,
          episodeDate: data.episodeDate,
          episodeDuration: data.episodeDuration,
          tldl: data.tldl,
          whatHappened: data.whatHappened,
          keyInsights: data.keyInsights,
          quote: data.quote,
          quoteAttribution: data.quoteAttribution,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async getAllExampleRecaps(): Promise<PodcastExampleRecap[]> {
    return db.select().from(podcastExampleRecaps).orderBy(desc(podcastExampleRecaps.updatedAt));
  }


  async getRecentTranscripts(limit: number = 50): Promise<EpisodeTranscript[]> {
    return db.select().from(episodeTranscripts).orderBy(desc(episodeTranscripts.fetchedAt)).limit(limit);
  }
}

export const storage = new DatabaseStorage();
