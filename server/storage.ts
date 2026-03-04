import { db } from "./db";
import { users, recaps, type CreateUserRequest, type UpdateUserRequest, type UserResponse, type Recap, type InsertRecap } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  createUser(user: CreateUserRequest): Promise<UserResponse>;
  getUserByEmail(email: string): Promise<UserResponse | undefined>;
  getUserById(id: number): Promise<UserResponse | undefined>;
  updateUser(id: number, updates: UpdateUserRequest): Promise<UserResponse>;
  getRecapsByUserId(userId: number): Promise<Recap[]>;
  createRecap(recap: InsertRecap): Promise<Recap>;
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
}

export const storage = new DatabaseStorage();
