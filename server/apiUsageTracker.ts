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

const ELEVENLABS_PRICING: Record<string, number> = {
  "eleven_multilingual_v2": 0.30 / 1000,
  "eleven_turbo_v2_5": 0.15 / 1000,
  "eleven_turbo_v2": 0.15 / 1000,
  "eleven_monolingual_v1": 0.30 / 1000,
  "default": 0.30 / 1000,
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["gpt-4o-mini"];
  return promptTokens * pricing.input + completionTokens * pricing.output;
}

export function estimateElevenLabsCost(characterCount: number, model: string = "default"): number {
  const pricePerChar = ELEVENLABS_PRICING[model] || ELEVENLABS_PRICING["default"];
  return characterCount * pricePerChar;
}

interface UsageOptions {
  service?: string;
  podcastSlug?: string;
  episodeSlug?: string;
}

export async function logApiUsage(
  model: string,
  feature: string,
  promptTokens: number,
  completionTokens: number,
  totalTokens?: number,
  metadata?: Record<string, unknown>,
  options?: UsageOptions,
): Promise<void> {
  try {
    const cost = estimateCost(model, promptTokens, completionTokens);
    const total = totalTokens ?? (promptTokens + completionTokens);
    const service = options?.service || "openai";
    const podSlug = options?.podcastSlug || null;
    const epSlug = options?.episodeSlug || null;
    await pool.query(
      `INSERT INTO api_usage_logs (model, feature, prompt_tokens, completion_tokens, total_tokens, estimated_cost, metadata, service, podcast_slug, episode_slug)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [model, feature, promptTokens, completionTokens, total, cost, metadata ? JSON.stringify(metadata) : null, service, podSlug, epSlug]
    );
  } catch (err) {
    console.error("[ApiUsageTracker] Failed to log usage:", err);
  }
}

export async function logElevenLabsUsage(
  model: string,
  feature: string,
  characterCount: number,
  cost: number,
  metadata?: Record<string, unknown>,
  options?: UsageOptions,
): Promise<void> {
  try {
    const service = options?.service || "elevenlabs";
    const podSlug = options?.podcastSlug || null;
    const epSlug = options?.episodeSlug || null;
    await pool.query(
      `INSERT INTO api_usage_logs (model, feature, prompt_tokens, completion_tokens, total_tokens, estimated_cost, metadata, service, podcast_slug, episode_slug)
       VALUES ($1, $2, $3, 0, $3, $4, $5, $6, $7, $8)`,
      [model, feature, characterCount, cost, metadata ? JSON.stringify(metadata) : null, service, podSlug, epSlug]
    );
  } catch (err) {
    console.error("[ApiUsageTracker] Failed to log ElevenLabs usage:", err);
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
  options?: UsageOptions,
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
      options,
    );
  } else {
    logApiUsage(model, feature, 0, 0, 0, metadata, options);
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
  options?: UsageOptions,
): Promise<void> {
  const promptTokens = estimateTokens(inputText);
  const completionTokens = estimateTokens(outputText);
  await logApiUsage(model, feature, promptTokens, completionTokens, undefined, metadata, options);
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
    ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS service TEXT DEFAULT 'openai';
    ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS podcast_slug TEXT;
    ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS episode_slug TEXT;
    ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS user_id INTEGER;
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
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_usage_service ON api_usage_logs (service)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_usage_podcast_slug ON api_usage_logs (podcast_slug)
  `);

  try {
    await pool.query(`
      UPDATE api_usage_logs
      SET service = 'openai'
      WHERE service IS NULL
    `);
    await pool.query(`
      UPDATE api_usage_logs
      SET podcast_slug = metadata->>'podcastSlug'
      WHERE podcast_slug IS NULL AND metadata->>'podcastSlug' IS NOT NULL
    `);
    await pool.query(`
      UPDATE api_usage_logs
      SET episode_slug = metadata->>'episodeSlug'
      WHERE episode_slug IS NULL AND metadata->>'episodeSlug' IS NOT NULL
    `);
    await pool.query(`
      UPDATE api_usage_logs
      SET service = 'elevenlabs'
      WHERE service = 'openai' AND feature LIKE '%elevenlabs%'
    `);
  } catch (err) {
    console.log("[ApiUsage] Backfill warning (non-fatal):", err);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS recap_audio (
      id SERIAL PRIMARY KEY,
      podcast_slug TEXT NOT NULL,
      episode_slug TEXT NOT NULL,
      audio_url TEXT,
      elevenlabs_request_id TEXT,
      voice_id TEXT,
      character_count INTEGER DEFAULT 0,
      audio_duration REAL DEFAULT 0,
      openai_script_cost REAL DEFAULT 0,
      elevenlabs_cost REAL DEFAULT 0,
      total_cost REAL DEFAULT 0,
      narration_script TEXT,
      status TEXT NOT NULL DEFAULT 'not_generated',
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_recap_audio_slugs ON recap_audio (podcast_slug, episode_slug)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audio_playback_events (
      id SERIAL PRIMARY KEY,
      podcast_slug TEXT NOT NULL,
      episode_slug TEXT NOT NULL,
      event_type TEXT NOT NULL,
      percentage_reached REAL DEFAULT 0,
      session_id TEXT,
      user_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_audio_playback_slugs ON audio_playback_events (podcast_slug, episode_slug)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_audio_playback_created ON audio_playback_events (created_at)
  `);
}
