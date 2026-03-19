import { pool } from "./db";
import type { ChatCompletion } from "openai/resources/chat/completions";

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
  "gpt-4o-mini": { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  "gpt-4o-mini-transcribe": { input: 0.60 / 1_000_000, output: 0.60 / 1_000_000 },
  "gpt-audio": { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
  "gpt-5.1": { input: 2.00 / 1_000_000, output: 8.00 / 1_000_000 },
  "gpt-image-1": { input: 0, output: 0 },
};

const IMAGE_FLAT_COST: Record<string, number> = {
  "1024x1024": 0.04,
  "512x512": 0.02,
  "256x256": 0.01,
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["gpt-4o-mini"];
  return promptTokens * pricing.input + completionTokens * pricing.output;
}

export async function logApiUsage(
  model: string,
  feature: string,
  promptTokens: number,
  completionTokens: number,
  totalTokens?: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const cost = estimateCost(model, promptTokens, completionTokens);
    const total = totalTokens ?? (promptTokens + completionTokens);
    await pool.query(
      `INSERT INTO api_usage_logs (model, feature, prompt_tokens, completion_tokens, total_tokens, estimated_cost, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [model, feature, promptTokens, completionTokens, total, cost, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error("[ApiUsageTracker] Failed to log usage:", err);
  }
}

export async function logImageUsage(
  model: string,
  feature: string,
  size: string = "1024x1024",
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const cost = IMAGE_FLAT_COST[size] || 0.04;
    await pool.query(
      `INSERT INTO api_usage_logs (model, feature, prompt_tokens, completion_tokens, total_tokens, estimated_cost, metadata)
       VALUES ($1, $2, 0, 0, 0, $3, $4)`,
      [model, feature, cost, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error("[ApiUsageTracker] Failed to log image usage:", err);
  }
}

export function logCompletionUsage(
  completion: ChatCompletion | { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } },
  model: string,
  feature: string,
  metadata?: Record<string, unknown>,
): void {
  const usage = completion?.usage;
  if (usage) {
    logApiUsage(
      model,
      feature,
      usage.prompt_tokens || 0,
      usage.completion_tokens || 0,
      usage.total_tokens,
      metadata,
    );
  } else {
    logApiUsage(model, feature, 0, 0, 0, metadata);
  }
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function logEstimatedUsage(
  model: string,
  feature: string,
  inputText: string,
  outputText: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const promptTokens = estimateTokens(inputText);
  const completionTokens = estimateTokens(outputText);
  await logApiUsage(model, feature, promptTokens, completionTokens, undefined, metadata);
}

export async function ensureApiUsageTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_usage_logs (
      id SERIAL PRIMARY KEY,
      model TEXT NOT NULL,
      feature TEXT NOT NULL,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      estimated_cost REAL DEFAULT 0,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS metadata JSONB;
    ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS utm_source TEXT;
    ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS utm_medium TEXT;
    ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
    ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS utm_content TEXT;
    ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS utm_term TEXT;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage_logs (created_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_usage_feature ON api_usage_logs (feature)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_usage_model ON api_usage_logs (model)
  `);
}
