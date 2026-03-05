import { db } from "./db";
import { users, recaps, episodeTranscripts, emailLogs, magicLinks, type CreateUserRequest, type UpdateUserRequest, type UserResponse, type Recap, type InsertRecap, type EpisodeTranscript, type EmailLog, type InsertEmailLog, type MagicLink } from "@shared/schema";
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
  createMagicLink(email: string, token: string, expiresAt: Date): Promise<MagicLink>;
  getMagicLinkByToken(token: string): Promise<MagicLink | undefined>;
  markMagicLinkUsed(id: number): Promise<void>;
  deleteUser(id: number): Promise<void>;
  getAllRecaps(): Promise<Recap[]>;
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
}

export const storage = new DatabaseStorage();
