import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  podcasts: text("podcasts").array().notNull(),
  readingLength: integer("reading_length").notNull().default(10),
  deliveryTime: text("delivery_time").notNull().default("07:00"),
  deliveryTimezone: text("delivery_timezone").notNull().default("America/New_York"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
}).extend({
  email: z.string().email("Please enter a valid email address"),
  podcasts: z.array(z.string()).min(1, "Select at least one podcast"),
  readingLength: z.number().min(5).max(20),
  deliveryTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format").optional(),
  deliveryTimezone: z.string().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type CreateUserRequest = InsertUser;
export type UpdateUserRequest = Partial<Pick<InsertUser, "email" | "readingLength" | "podcasts" | "deliveryTime" | "deliveryTimezone">>;
export type UserResponse = User;
