import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  min: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  allowExitOnIdle: true,
});

pool.on("error", (err) => {
  console.error("[DB Pool] Unexpected error on idle client:", err.message);
});

export const db = drizzle(pool, { schema });

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3,
  baseDelayMs = 2000,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isConnectionError =
        err.code === "ECONNREFUSED" ||
        err.code === "ENOTFOUND" ||
        err.code === "ETIMEDOUT" ||
        err.code === "57P01" ||
        err.code === "57P03" ||
        err.message?.includes("Connection terminated") ||
        err.message?.includes("connection timeout") ||
        err.message?.includes("sorry, too many clients");

      if (isConnectionError && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[DB Retry] ${label} attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delay}ms...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error(`[DB Retry] ${label} exhausted all retries`);
}
