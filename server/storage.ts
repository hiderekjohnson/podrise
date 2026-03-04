import { db } from "./db";
import { subscriptions, type CreateSubscriptionRequest, type SubscriptionResponse } from "@shared/schema";

export interface IStorage {
  createSubscription(subscription: CreateSubscriptionRequest): Promise<SubscriptionResponse>;
}

export class DatabaseStorage implements IStorage {
  async createSubscription(insertSubscription: CreateSubscriptionRequest): Promise<SubscriptionResponse> {
    const [subscription] = await db
      .insert(subscriptions)
      .values(insertSubscription)
      .returning();
    return subscription;
  }
}

export const storage = new DatabaseStorage();
