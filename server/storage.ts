import { db } from "./db";
import { users, recaps, type CreateUserRequest, type UpdateUserRequest, type UserResponse, type Recap, type InsertRecap } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

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

  async getAllUsers(): Promise<UserResponse[]> {
    return db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt));
  }
}

export const storage = new DatabaseStorage();
