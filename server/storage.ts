import { db } from "./db";
import { users, recaps, episodeTranscripts, emailLogs, magicLinks, transcriptLogs, pendingEmails, podcastExampleRecaps, podcastDirectory, landingPageRecaps, transcriptSegments, rssFeeds, podcastHosts, episodeQuotes, topicPulses, advertisers, bookmarks, deviceTokens, refreshTokens, errorLogs, referrals, referralTiers, pulseSubscriptions, type CreateUserRequest, type UpdateUserRequest, type UserResponse, type Recap, type InsertRecap, type EpisodeTranscript, type EmailLog, type InsertEmailLog, type MagicLink, type TranscriptLog, type PendingEmail, type InsertPendingEmail, type PodcastExampleRecap, type InsertPodcastExampleRecap, type PodcastDirectoryEntry, type InsertPodcastDirectoryEntry, type LandingPageRecap, type InsertLandingPageRecap, type TranscriptSegment, type InsertTranscriptSegment, type RssFeed, type InsertRssFeed, type PodcastHost, type InsertPodcastHost, type EpisodeQuote, type InsertEpisodeQuote, type TopicPulse, type InsertTopicPulse, type Advertiser, type InsertAdvertiser, type Bookmark, type InsertBookmark, type DeviceToken, type InsertDeviceToken, type RefreshToken, type ErrorLog, type InsertErrorLog, type Referral, type ReferralTier, type InsertReferralTier, type PulseSubscription } from "@shared/schema";
import { eq, desc, sql, and, gt, isNull, asc, inArray } from "drizzle-orm";

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
  saveTranscript(data: { podcastId: string; episodeGuid: string; episodeTitle: string; transcript: string; description?: string; subtitle?: string; datePublished?: number; duration?: number; audioUrl?: string; imageUrl?: string; seasonNumber?: number; episodeNumber?: number; episodeType?: string }): Promise<EpisodeTranscript>;
  logEmail(data: InsertEmailLog): Promise<EmailLog>;
  getEmailLogs(): Promise<EmailLog[]>;
  hasEmailLogForUserOnDate(userId: number, date: string): Promise<boolean>;
  createMagicLink(email: string, token: string, expiresAt: Date): Promise<MagicLink>;
  getMagicLinkByToken(token: string): Promise<MagicLink | undefined>;
  markMagicLinkUsed(id: number): Promise<void>;
  deleteUser(id: number): Promise<void>;
  getAllRecaps(): Promise<Recap[]>;
  getTopPodcasts(limit?: number): Promise<{ id: string; name: string; artworkUrl: string; userCount: number }[]>;
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
  getPodcastDirectory(): Promise<PodcastDirectoryEntry[]>;
  getPodcastDirectoryEntry(itunesId: string): Promise<PodcastDirectoryEntry | undefined>;
  getPodcastDirectoryBySlug(slug: string): Promise<PodcastDirectoryEntry | undefined>;
  upsertPodcastDirectoryEntry(data: InsertPodcastDirectoryEntry): Promise<PodcastDirectoryEntry>;
  deletePodcastDirectoryEntry(id: number): Promise<void>;
  updatePodcastTaddyUuid(itunesId: string, taddyUuid: string): Promise<void>;
  getLandingPageRecaps(slug: string, limit?: number, offset?: number): Promise<LandingPageRecap[]>;
  getLandingPageRecapCount(slug: string): Promise<number>;
  getLandingPageRecapBySlug(podcastSlug: string, episodeSlug: string): Promise<LandingPageRecap | undefined>;
  upsertLandingPageRecap(data: InsertLandingPageRecap): Promise<LandingPageRecap>;
  getLandingPageRecapSlugs(): Promise<string[]>;
  saveTranscriptSegments(segments: InsertTranscriptSegment[]): Promise<void>;
  getTranscriptSegments(episodeGuid: string): Promise<TranscriptSegment[]>;
  getTranscriptSegmentsBySlug(podcastSlug: string, episodeSlug: string): Promise<TranscriptSegment[]>;
  hasTranscriptSegments(episodeGuid: string): Promise<boolean>;
  getRssFeeds(): Promise<RssFeed[]>;
  getRssFeedBySlugKey(slugKey: string): Promise<RssFeed | undefined>;
  createRssFeed(data: InsertRssFeed): Promise<RssFeed>;
  updateRssFeed(id: number, data: Partial<InsertRssFeed>): Promise<RssFeed>;
  deleteRssFeed(id: number): Promise<void>;
  getRecentRecapsForRss(podcastSlugs: string[] | null, limit: number): Promise<LandingPageRecap[]>;
  getHostsByPodcastSlug(podcastSlug: string): Promise<PodcastHost[]>;
  upsertHost(data: InsertPodcastHost & { id?: number }): Promise<PodcastHost>;
  deleteHost(id: number): Promise<void>;
  getEpisodeQuotes(podcastSlug: string, episodeSlug: string): Promise<EpisodeQuote[]>;
  saveEpisodeQuotes(quotes: InsertEpisodeQuote[]): Promise<EpisodeQuote[]>;
  deleteEpisodeQuotes(podcastSlug: string, episodeSlug: string): Promise<void>;
  getTopicPulses(topicSlug: string, limit?: number): Promise<TopicPulse[]>;
  getTopicPulseByDate(topicSlug: string, publishDate: string): Promise<TopicPulse | undefined>;
  getRecentPulsesAcrossTopics(excludeSlug: string, limit?: number): Promise<TopicPulse[]>;
  upsertTopicPulse(data: InsertTopicPulse): Promise<TopicPulse>;
  getAdvertisers(): Promise<Advertiser[]>;
  createAdvertiser(data: InsertAdvertiser): Promise<Advertiser>;
  updateAdvertiser(id: number, data: InsertAdvertiser): Promise<Advertiser>;
  deleteAdvertiser(id: number): Promise<void>;
  getBookmarksByUserId(userId: number): Promise<Bookmark[]>;
  addBookmark(data: InsertBookmark): Promise<Bookmark>;
  removeBookmark(userId: number, podcastSlug: string, episodeSlug: string): Promise<void>;
  isBookmarked(userId: number, podcastSlug: string, episodeSlug: string): Promise<boolean>;
  registerDeviceToken(userId: number, deviceToken: string, platform?: string): Promise<DeviceToken>;
  unregisterDeviceToken(deviceToken: string, userId: number): Promise<void>;
  getDeviceTokensByUserId(userId: number): Promise<DeviceToken[]>;
  createRefreshToken(userId: number, token: string, expiresAt: Date): Promise<RefreshToken>;
  getRefreshToken(token: string): Promise<RefreshToken | undefined>;
  revokeRefreshToken(token: string): Promise<void>;
  revokeAllRefreshTokensForUser(userId: number): Promise<void>;
  logError(data: InsertErrorLog): Promise<ErrorLog>;
  getErrorLogs(limit?: number, offset?: number, severity?: string, startDate?: Date, endDate?: Date): Promise<ErrorLog[]>;
  getErrorLogCount(severity?: string, startDate?: Date, endDate?: Date): Promise<number>;
  getUserByReferralCode(code: string): Promise<UserResponse | undefined>;
  createReferral(referrerId: number, referredUserId: number): Promise<Referral>;
  verifyReferral(referredUserId: number): Promise<Referral | undefined>;
  getReferralCount(userId: number): Promise<number>;
  getPendingReferralCount(userId: number): Promise<number>;
  getLeaderboard(limit?: number): Promise<{ userId: number; displayName: string | null; email: string; count: number }[]>;
  getReferralTiers(): Promise<ReferralTier[]>;
  getReferralTierById(id: number): Promise<ReferralTier | undefined>;
  createReferralTier(data: InsertReferralTier): Promise<ReferralTier>;
  updateReferralTier(id: number, data: Partial<InsertReferralTier>): Promise<ReferralTier>;
  deleteReferralTier(id: number): Promise<void>;
  getPulseSubscriptions(userId: number): Promise<PulseSubscription[]>;
  addPulseSubscription(userId: number, topicSlug: string): Promise<PulseSubscription>;
  removePulseSubscription(userId: number, topicSlug: string): Promise<void>;
  bulkUpdatePulseSubscriptions(userId: number, topicSlugs: string[]): Promise<PulseSubscription[]>;
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

  async saveTranscript(data: { podcastId: string; episodeGuid: string; episodeTitle: string; transcript: string; description?: string; subtitle?: string; datePublished?: number; duration?: number; audioUrl?: string; imageUrl?: string; seasonNumber?: number; episodeNumber?: number; episodeType?: string }): Promise<EpisodeTranscript> {
    const isComplete = !!(data.transcript && data.description && data.datePublished && data.duration && data.audioUrl);
    const updateSet: Record<string, any> = {
      description: data.description,
      subtitle: data.subtitle,
      datePublished: data.datePublished,
      duration: data.duration,
      audioUrl: data.audioUrl,
      imageUrl: data.imageUrl,
      seasonNumber: data.seasonNumber,
      episodeNumber: data.episodeNumber,
      episodeType: data.episodeType,
      fetchedAt: new Date(),
    };
    if (data.transcript) {
      updateSet.transcript = data.transcript;
      updateSet.completeRecord = isComplete;
    }
    const [created] = await db
      .insert(episodeTranscripts)
      .values({ ...data, completeRecord: isComplete })
      .onConflictDoUpdate({
        target: episodeTranscripts.episodeGuid,
        set: updateSet,
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
    const user = await this.getUserById(id);
    await db.delete(pendingEmails).where(eq(pendingEmails.userId, id));
    await db.delete(emailLogs).where(eq(emailLogs.userId, id));
    await db.delete(transcriptLogs).where(eq(transcriptLogs.userId, id));
    await db.delete(recaps).where(eq(recaps.userId, id));
    if (user?.email) {
      await db.delete(magicLinks).where(eq(magicLinks.email, user.email));
    }
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

  async getPodcastDirectory(): Promise<PodcastDirectoryEntry[]> {
    return db.select().from(podcastDirectory).orderBy(podcastDirectory.name);
  }

  async getPodcastDirectoryEntry(itunesId: string): Promise<PodcastDirectoryEntry | undefined> {
    const [entry] = await db.select().from(podcastDirectory).where(eq(podcastDirectory.itunesId, itunesId));
    return entry;
  }

  async getPodcastDirectoryBySlug(slug: string): Promise<PodcastDirectoryEntry | undefined> {
    const [entry] = await db.select().from(podcastDirectory).where(eq(podcastDirectory.slug, slug));
    return entry;
  }

  async upsertPodcastDirectoryEntry(data: InsertPodcastDirectoryEntry): Promise<PodcastDirectoryEntry> {
    const { itunesId, ...rest } = data;
    const updateFields: Record<string, any> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) {
        updateFields[key] = value;
      }
    }
    try {
      const [entry] = await db
        .insert(podcastDirectory)
        .values(data)
        .onConflictDoUpdate({
          target: podcastDirectory.itunesId,
          set: updateFields,
        })
        .returning();
      return entry;
    } catch (err: any) {
      if (err?.code === '23505' && err?.constraint?.includes('slug')) {
        const [existing] = await db.select().from(podcastDirectory).where(eq(podcastDirectory.slug, data.slug)).limit(1);
        if (existing) {
          const [updated] = await db.update(podcastDirectory).set(updateFields).where(eq(podcastDirectory.slug, data.slug)).returning();
          return updated;
        }
      }
      throw err;
    }
  }

  async deletePodcastDirectoryEntry(id: number): Promise<void> {
    await db.delete(podcastDirectory).where(eq(podcastDirectory.id, id));
  }

  async updatePodcastTaddyUuid(itunesId: string, taddyUuid: string): Promise<void> {
    await db.update(podcastDirectory)
      .set({ taddyUuid, updatedAt: new Date() })
      .where(eq(podcastDirectory.itunesId, itunesId));
  }

  async getLandingPageRecaps(slug: string, limit: number = 10, offset: number = 0): Promise<LandingPageRecap[]> {
    return db.select().from(landingPageRecaps)
      .where(eq(landingPageRecaps.slug, slug))
      .orderBy(desc(landingPageRecaps.publishDate), desc(landingPageRecaps.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getLandingPageRecapCount(slug: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(landingPageRecaps)
      .where(eq(landingPageRecaps.slug, slug));
    return Number(result?.count || 0);
  }

  async getLandingPageRecapBySlug(podcastSlug: string, episodeSlug: string): Promise<LandingPageRecap | undefined> {
    const [recap] = await db.select().from(landingPageRecaps)
      .where(and(eq(landingPageRecaps.slug, podcastSlug), eq(landingPageRecaps.episodeSlug, episodeSlug)));
    return recap;
  }

  async upsertLandingPageRecap(data: InsertLandingPageRecap): Promise<LandingPageRecap> {
    const [result] = await db
      .insert(landingPageRecaps)
      .values(data)
      .onConflictDoUpdate({
        target: [landingPageRecaps.slug, landingPageRecaps.episodeSlug],
        set: {
          podcastName: data.podcastName,
          episodeTitle: data.episodeTitle,
          publishDate: data.publishDate,
          duration: data.duration,
          artworkUrl: data.artworkUrl,
          hosts: data.hosts,
          tldl: data.tldl,
          whatHappened: data.whatHappened,
          keyInsights: data.keyInsights,
          quote: data.quote,
          quoteAttribution: data.quoteAttribution,
          appleEpisodeUrl: data.appleEpisodeUrl,
          audioUrl: data.audioUrl,
          keyTopics: data.keyTopics,
          topQuestions: data.topQuestions,
          showNotes: data.showNotes,
          guests: data.guests,
          sponsors: data.sponsors,
          resources: data.resources,
          published: data.published,
        },
      })
      .returning();
    return result;
  }

  async getLandingPageRecapSlugs(): Promise<string[]> {
    const results = await db.selectDistinct({ slug: landingPageRecaps.slug }).from(landingPageRecaps);
    return results.map(r => r.slug);
  }

  async saveTranscriptSegments(segments: InsertTranscriptSegment[]): Promise<void> {
    if (segments.length === 0) return;
    const episodeGuid = segments[0].episodeGuid;
    await db.delete(transcriptSegments).where(eq(transcriptSegments.episodeGuid, episodeGuid));
    const batchSize = 100;
    for (let i = 0; i < segments.length; i += batchSize) {
      await db.insert(transcriptSegments).values(segments.slice(i, i + batchSize));
    }
  }

  async getTranscriptSegments(episodeGuid: string): Promise<TranscriptSegment[]> {
    return db
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.episodeGuid, episodeGuid))
      .orderBy(asc(transcriptSegments.sequenceIndex));
  }

  async getTranscriptSegmentsBySlug(podcastSlug: string, episodeSlug: string): Promise<TranscriptSegment[]> {
    return db
      .select()
      .from(transcriptSegments)
      .where(and(
        eq(transcriptSegments.podcastSlug, podcastSlug),
        eq(transcriptSegments.episodeSlug, episodeSlug)
      ))
      .orderBy(asc(transcriptSegments.sequenceIndex));
  }

  async hasTranscriptSegments(episodeGuid: string): Promise<boolean> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(transcriptSegments)
      .where(eq(transcriptSegments.episodeGuid, episodeGuid));
    return (result[0]?.count ?? 0) > 0;
  }

  async getRssFeeds(): Promise<RssFeed[]> {
    return db.select().from(rssFeeds).orderBy(asc(rssFeeds.name));
  }

  async getRssFeedBySlugKey(slugKey: string): Promise<RssFeed | undefined> {
    const [feed] = await db.select().from(rssFeeds).where(eq(rssFeeds.slugKey, slugKey));
    return feed;
  }

  async createRssFeed(data: InsertRssFeed): Promise<RssFeed> {
    const [feed] = await db.insert(rssFeeds).values(data).returning();
    return feed;
  }

  async updateRssFeed(id: number, data: Partial<InsertRssFeed>): Promise<RssFeed> {
    const [feed] = await db.update(rssFeeds).set(data).where(eq(rssFeeds.id, id)).returning();
    return feed;
  }

  async deleteRssFeed(id: number): Promise<void> {
    await db.delete(rssFeeds).where(eq(rssFeeds.id, id));
  }

  async getRecentRecapsForRss(podcastSlugs: string[] | null, limit: number): Promise<LandingPageRecap[]> {
    if (podcastSlugs && podcastSlugs.length > 0) {
      return db
        .select()
        .from(landingPageRecaps)
        .where(inArray(landingPageRecaps.slug, podcastSlugs))
        .orderBy(desc(landingPageRecaps.createdAt))
        .limit(limit);
    }
    return db
      .select()
      .from(landingPageRecaps)
      .orderBy(desc(landingPageRecaps.createdAt))
      .limit(limit);
  }
  async getHostsByPodcastSlug(podcastSlug: string): Promise<PodcastHost[]> {
    return db.select().from(podcastHosts).where(eq(podcastHosts.podcastSlug, podcastSlug)).orderBy(asc(podcastHosts.sortOrder));
  }

  async upsertHost(data: InsertPodcastHost & { id?: number }): Promise<PodcastHost> {
    if (data.id) {
      const [updated] = await db.update(podcastHosts).set({
        name: data.name,
        bio: data.bio,
        photoUrl: data.photoUrl,
        twitterHandle: data.twitterHandle,
        linkedinUrl: data.linkedinUrl,
        instagramHandle: data.instagramHandle,
        websiteUrl: data.websiteUrl,
        sortOrder: data.sortOrder,
      }).where(eq(podcastHosts.id, data.id)).returning();
      return updated;
    }
    const [created] = await db.insert(podcastHosts).values(data).returning();
    return created;
  }

  async deleteHost(id: number): Promise<void> {
    await db.delete(podcastHosts).where(eq(podcastHosts.id, id));
  }

  async getEpisodeQuotes(podcastSlug: string, episodeSlug: string): Promise<EpisodeQuote[]> {
    return db.select().from(episodeQuotes)
      .where(and(eq(episodeQuotes.podcastSlug, podcastSlug), eq(episodeQuotes.episodeSlug, episodeSlug)))
      .orderBy(asc(episodeQuotes.sortOrder));
  }

  async saveEpisodeQuotes(quotes: InsertEpisodeQuote[]): Promise<EpisodeQuote[]> {
    if (quotes.length === 0) return [];
    const result = await db.insert(episodeQuotes).values(quotes).returning();
    return result;
  }

  async deleteEpisodeQuotes(podcastSlug: string, episodeSlug: string): Promise<void> {
    await db.delete(episodeQuotes).where(
      and(eq(episodeQuotes.podcastSlug, podcastSlug), eq(episodeQuotes.episodeSlug, episodeSlug))
    );
  }

  async getTopicPulses(topicSlug: string, limit: number = 30): Promise<TopicPulse[]> {
    return db.select().from(topicPulses)
      .where(eq(topicPulses.topicSlug, topicSlug))
      .orderBy(desc(topicPulses.publishDate))
      .limit(limit);
  }

  async getRecentPulsesAcrossTopics(excludeSlug: string, limit: number = 3): Promise<TopicPulse[]> {
    return db.select().from(topicPulses)
      .where(sql`${topicPulses.topicSlug} != ${excludeSlug}`)
      .orderBy(desc(topicPulses.publishDate))
      .limit(limit);
  }

  async getTopicPulseByDate(topicSlug: string, publishDate: string): Promise<TopicPulse | undefined> {
    const [pulse] = await db.select().from(topicPulses)
      .where(and(eq(topicPulses.topicSlug, topicSlug), eq(topicPulses.publishDate, publishDate)));
    return pulse;
  }

  async upsertTopicPulse(data: InsertTopicPulse): Promise<TopicPulse> {
    const existing = await this.getTopicPulseByDate(data.topicSlug, data.publishDate);
    if (existing) {
      const [updated] = await db.update(topicPulses)
        .set({ ...data, generatedAt: new Date() })
        .where(eq(topicPulses.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(topicPulses).values(data).returning();
    return created;
  }

  async getAdvertisers(): Promise<Advertiser[]> {
    return db.select().from(advertisers).orderBy(desc(advertisers.createdAt));
  }

  async createAdvertiser(data: InsertAdvertiser): Promise<Advertiser> {
    const [created] = await db.insert(advertisers).values(data).returning();
    return created;
  }

  async updateAdvertiser(id: number, data: InsertAdvertiser): Promise<Advertiser> {
    const [updated] = await db.update(advertisers).set(data).where(eq(advertisers.id, id)).returning();
    return updated;
  }

  async deleteAdvertiser(id: number): Promise<void> {
    await db.delete(advertisers).where(eq(advertisers.id, id));
  }

  async getBookmarksByUserId(userId: number): Promise<Bookmark[]> {
    return db.select().from(bookmarks).where(eq(bookmarks.userId, userId)).orderBy(desc(bookmarks.createdAt));
  }

  async addBookmark(data: InsertBookmark): Promise<Bookmark> {
    const [created] = await db.insert(bookmarks).values(data).onConflictDoNothing().returning();
    if (!created) {
      const [existing] = await db.select().from(bookmarks).where(and(eq(bookmarks.userId, data.userId!), eq(bookmarks.podcastSlug, data.podcastSlug), eq(bookmarks.episodeSlug, data.episodeSlug)));
      return existing;
    }
    return created;
  }

  async removeBookmark(userId: number, podcastSlug: string, episodeSlug: string): Promise<void> {
    await db.delete(bookmarks).where(and(eq(bookmarks.userId, userId), eq(bookmarks.podcastSlug, podcastSlug), eq(bookmarks.episodeSlug, episodeSlug)));
  }

  async isBookmarked(userId: number, podcastSlug: string, episodeSlug: string): Promise<boolean> {
    const [row] = await db.select().from(bookmarks).where(and(eq(bookmarks.userId, userId), eq(bookmarks.podcastSlug, podcastSlug), eq(bookmarks.episodeSlug, episodeSlug)));
    return !!row;
  }

  async registerDeviceToken(userId: number, token: string, platform: string = "ios"): Promise<DeviceToken> {
    const [existing] = await db.select().from(deviceTokens).where(eq(deviceTokens.deviceToken, token));
    if (existing) {
      if (existing.userId !== userId) {
        const [updated] = await db.update(deviceTokens).set({ userId }).where(eq(deviceTokens.deviceToken, token)).returning();
        return updated;
      }
      return existing;
    }
    const [created] = await db.insert(deviceTokens).values({ userId, deviceToken: token, platform }).returning();
    return created;
  }

  async unregisterDeviceToken(token: string, userId: number): Promise<void> {
    await db.delete(deviceTokens).where(
      and(eq(deviceTokens.deviceToken, token), eq(deviceTokens.userId, userId))
    );
  }

  async getDeviceTokensByUserId(userId: number): Promise<DeviceToken[]> {
    return db.select().from(deviceTokens).where(eq(deviceTokens.userId, userId));
  }

  async createRefreshToken(userId: number, token: string, expiresAt: Date): Promise<RefreshToken> {
    const [created] = await db.insert(refreshTokens).values({ userId, token, expiresAt }).returning();
    return created;
  }

  async getRefreshToken(token: string): Promise<RefreshToken | undefined> {
    const [row] = await db.select().from(refreshTokens).where(
      and(eq(refreshTokens.token, token), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date()))
    );
    return row ?? undefined;
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.token, token));
  }

  async revokeAllRefreshTokensForUser(userId: number): Promise<void> {
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(
      and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt))
    );
  }

  async logError(data: InsertErrorLog): Promise<ErrorLog> {
    const conditions = [
      eq(errorLogs.endpoint, data.endpoint),
      eq(errorLogs.errorMessage, data.errorMessage),
      eq(errorLogs.httpStatus, data.httpStatus ?? 500),
    ];
    if (data.method) conditions.push(eq(errorLogs.method, data.method));
    const existing = await db.select().from(errorLogs)
      .where(and(...conditions))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(errorLogs)
        .set({
          occurrenceCount: sql`${errorLogs.occurrenceCount} + 1`,
          lastOccurredAt: new Date(),
          userAgent: data.userAgent || existing[0].userAgent,
          userId: data.userId || existing[0].userId,
        })
        .where(eq(errorLogs.id, existing[0].id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(errorLogs).values({
      ...data,
      httpStatus: data.httpStatus ?? 500,
    }).returning();
    return created;
  }

  async getErrorLogs(limit = 50, offset = 0, severity?: string, startDate?: Date, endDate?: Date): Promise<ErrorLog[]> {
    const conditions: any[] = [];
    if (severity) conditions.push(eq(errorLogs.severity, severity));
    if (startDate) conditions.push(sql`${errorLogs.lastOccurredAt} >= ${startDate}`);
    if (endDate) conditions.push(sql`${errorLogs.lastOccurredAt} <= ${endDate}`);
    if (conditions.length > 0) {
      return db.select().from(errorLogs)
        .where(and(...conditions))
        .orderBy(desc(errorLogs.lastOccurredAt))
        .limit(limit)
        .offset(offset);
    }
    return db.select().from(errorLogs)
      .orderBy(desc(errorLogs.lastOccurredAt))
      .limit(limit)
      .offset(offset);
  }

  async getErrorLogCount(severity?: string, startDate?: Date, endDate?: Date): Promise<number> {
    const conditions: any[] = [];
    if (severity) conditions.push(eq(errorLogs.severity, severity));
    if (startDate) conditions.push(sql`${errorLogs.lastOccurredAt} >= ${startDate}`);
    if (endDate) conditions.push(sql`${errorLogs.lastOccurredAt} <= ${endDate}`);
    if (conditions.length > 0) {
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(errorLogs)
        .where(and(...conditions));
      return result?.count ?? 0;
    }
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(errorLogs);
    return result?.count ?? 0;
  }

  async getUserByReferralCode(code: string): Promise<UserResponse | undefined> {
    const [user] = await db.select().from(users).where(eq(users.referralCode, code));
    return user ?? undefined;
  }

  async createReferral(referrerId: number, referredUserId: number): Promise<Referral> {
    const [created] = await db.insert(referrals).values({ referrerId, referredUserId }).returning();
    return created;
  }

  async verifyReferral(referredUserId: number): Promise<Referral | undefined> {
    const [existing] = await db.select().from(referrals)
      .where(and(eq(referrals.referredUserId, referredUserId), eq(referrals.status, "pending")));
    if (!existing) return undefined;
    const [updated] = await db.update(referrals)
      .set({ status: "verified", verifiedAt: new Date() })
      .where(eq(referrals.id, existing.id))
      .returning();
    return updated;
  }

  async getReferralCount(userId: number): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(referrals)
      .where(and(eq(referrals.referrerId, userId), eq(referrals.status, "verified")));
    return Number(result?.count ?? 0);
  }

  async getPendingReferralCount(userId: number): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(referrals)
      .where(and(eq(referrals.referrerId, userId), eq(referrals.status, "pending")));
    return Number(result?.count ?? 0);
  }

  async getLeaderboard(limit: number = 20): Promise<{ userId: number; displayName: string | null; email: string; count: number }[]> {
    const result = await db
      .select({
        userId: referrals.referrerId,
        displayName: users.displayName,
        email: users.email,
        count: sql<number>`count(*)::int`,
      })
      .from(referrals)
      .innerJoin(users, eq(referrals.referrerId, users.id))
      .where(eq(referrals.status, "verified"))
      .groupBy(referrals.referrerId, users.displayName, users.email)
      .orderBy(sql`count(*) DESC`)
      .limit(limit);
    return result;
  }

  async getReferralTiers(): Promise<ReferralTier[]> {
    return db.select().from(referralTiers).orderBy(asc(referralTiers.sortOrder));
  }

  async getReferralTierById(id: number): Promise<ReferralTier | undefined> {
    const [tier] = await db.select().from(referralTiers).where(eq(referralTiers.id, id));
    return tier ?? undefined;
  }

  async createReferralTier(data: InsertReferralTier): Promise<ReferralTier> {
    const [created] = await db.insert(referralTiers).values(data).returning();
    return created;
  }

  async updateReferralTier(id: number, data: Partial<InsertReferralTier>): Promise<ReferralTier> {
    const [updated] = await db.update(referralTiers).set(data).where(eq(referralTiers.id, id)).returning();
    return updated;
  }

  async deleteReferralTier(id: number): Promise<void> {
    await db.delete(referralTiers).where(eq(referralTiers.id, id));
  }

  async getPulseSubscriptions(userId: number): Promise<PulseSubscription[]> {
    return db.select().from(pulseSubscriptions)
      .where(eq(pulseSubscriptions.userId, userId))
      .orderBy(asc(pulseSubscriptions.subscribedAt));
  }

  async addPulseSubscription(userId: number, topicSlug: string): Promise<PulseSubscription> {
    const [sub] = await db.insert(pulseSubscriptions)
      .values({ userId, topicSlug })
      .onConflictDoNothing()
      .returning();
    if (sub) return sub;
    const [existing] = await db.select().from(pulseSubscriptions)
      .where(and(eq(pulseSubscriptions.userId, userId), eq(pulseSubscriptions.topicSlug, topicSlug)))
      .limit(1);
    return existing;
  }

  async removePulseSubscription(userId: number, topicSlug: string): Promise<void> {
    await db.delete(pulseSubscriptions)
      .where(and(eq(pulseSubscriptions.userId, userId), eq(pulseSubscriptions.topicSlug, topicSlug)));
  }

  async bulkUpdatePulseSubscriptions(userId: number, topicSlugs: string[]): Promise<PulseSubscription[]> {
    await db.delete(pulseSubscriptions).where(eq(pulseSubscriptions.userId, userId));
    if (topicSlugs.length === 0) return [];
    const values = topicSlugs.map(slug => ({ userId, topicSlug: slug }));
    return db.insert(pulseSubscriptions).values(values).returning();
  }
}

export const storage = new DatabaseStorage();
