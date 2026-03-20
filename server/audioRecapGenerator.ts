import { pool } from "./db";
import { openai } from "./replit_integrations/image/client";
import { logCompletionUsage, logElevenLabsUsage, estimateElevenLabsCost } from "./apiUsageTracker";
import { objectStorageClient } from "./replit_integrations/object_storage";

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

function getAudioBucketName(): string {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not configured");
  }
  return bucketId;
}

function getAudioObjectPath(podcastSlug: string, episodeSlug: string): string {
  return `audio-recaps/${podcastSlug}_${episodeSlug}.mp3`;
}

export async function uploadAudioToStorage(audioBuffer: Buffer, podcastSlug: string, episodeSlug: string): Promise<void> {
  const bucketName = getAudioBucketName();
  const objectPath = getAudioObjectPath(podcastSlug, episodeSlug);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectPath);
  await file.save(audioBuffer, {
    contentType: "audio/mpeg",
    resumable: false,
  });
}

export async function streamAudioFromStorage(podcastSlug: string, episodeSlug: string): Promise<NodeJS.ReadableStream | null> {
  const bucketName = getAudioBucketName();
  const objectPath = getAudioObjectPath(podcastSlug, episodeSlug);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectPath);
  const [exists] = await file.exists();
  if (!exists) {
    return null;
  }
  return file.createReadStream();
}

interface RecapData {
  podcastName: string;
  episodeTitle: string;
  keyInsights: string[];
  whatHappened: string;
  resources?: string;
  tldl?: string;
}

async function generateNarrationScript(recapData: RecapData, podcastSlug: string, episodeSlug: string): Promise<{ script: string; cost: number }> {
  let books: string[] = [];
  try {
    if (recapData.resources) {
      const resources = typeof recapData.resources === "string" ? JSON.parse(recapData.resources) : recapData.resources;
      if (Array.isArray(resources)) {
        books = resources.filter((r: any) => r.type === "book" && r.name).map((r: any) => `"${r.name}" by ${r.author || "unknown"}`);
      }
    }
  } catch {}

  const whatHappenedTrimmed = recapData.whatHappened.split("\n\n").slice(0, 5).join("\n\n");

  const prompt = `You are a skilled podcast recap narrator. Transform the following structured recap data into a smooth, conversational narration script that sounds natural when read aloud by a text-to-speech engine.

PODCAST: ${recapData.podcastName}
EPISODE: "${recapData.episodeTitle}"

KEY TAKEAWAYS:
${recapData.keyInsights.map((insight, i) => `${i + 1}. ${insight}`).join("\n")}

WHAT HAPPENED:
${whatHappenedTrimmed}

${books.length > 0 ? `BOOKS MENTIONED:\n${books.join("\n")}` : ""}

INSTRUCTIONS:
- Start with a brief, engaging intro: "Here's your recap of [episode title] from [podcast name]."
- Weave the key takeaways into the narration naturally. Don't number them or say "Key Takeaway 1."
- Use conversational transitions like "One of the big things that came up...", "Another interesting point was...", "What really stood out was..."
- Cover the main narrative from the "What Happened" section, condensing it into the most important points
- If books were mentioned, work them in naturally: "They also talked about [book] by [author]..."
- End with a brief wrap-up: "That's the recap for this episode of [podcast name]."
- Keep the total length between 800-1500 words for a 3-6 minute narration
- Do NOT use markdown, bullet points, headers, or any formatting - pure spoken text
- Do NOT use exclamation marks excessively
- Write in a warm, informative tone - like a knowledgeable friend catching you up`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 3000,
    temperature: 0.6,
  });

  logCompletionUsage(completion, "gpt-4o-mini", "audio_narration_script", undefined, {
    service: "openai",
    podcastSlug,
    episodeSlug,
  });

  const script = completion.choices[0]?.message?.content || "";
  const usage = completion.usage;
  const promptTokens = usage?.prompt_tokens || 0;
  const completionTokens = usage?.completion_tokens || 0;
  const cost = promptTokens * (0.15 / 1_000_000) + completionTokens * (0.60 / 1_000_000);

  return { script, cost };
}

async function generateElevenLabsAudio(
  script: string,
  voiceId: string = DEFAULT_VOICE_ID,
  modelId: string = DEFAULT_MODEL_ID,
): Promise<{ audioBuffer: Buffer; requestId: string | null; characterCount: number }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY not configured");
  }

  const response = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text: script,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`);
  }

  const requestId = response.headers.get("request-id") || response.headers.get("x-request-id");
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);
  const characterCount = script.length;

  return { audioBuffer, requestId, characterCount };
}

function estimateAudioDuration(characterCount: number): number {
  const wordsPerMinute = 150;
  const avgCharsPerWord = 5;
  const words = characterCount / avgCharsPerWord;
  return (words / wordsPerMinute) * 60;
}

export async function generateAudioForEpisode(
  podcastSlug: string,
  episodeSlug: string,
): Promise<{ success: boolean; error?: string; audioUrl?: string }> {
  try {
    await pool.query(
      `INSERT INTO recap_audio (podcast_slug, episode_slug, status)
       VALUES ($1, $2, 'generating')
       ON CONFLICT (podcast_slug, episode_slug) DO UPDATE SET status = 'generating', error_message = NULL, updated_at = NOW()`,
      [podcastSlug, episodeSlug]
    );

    const { rows } = await pool.query(
      `SELECT * FROM landing_page_recaps WHERE slug = $1 AND episode_slug = $2 LIMIT 1`,
      [podcastSlug, episodeSlug]
    );

    if (rows.length === 0) {
      await pool.query(
        `UPDATE recap_audio SET status = 'error', error_message = 'No recap found for this episode', updated_at = NOW()
         WHERE podcast_slug = $1 AND episode_slug = $2`,
        [podcastSlug, episodeSlug]
      );
      return { success: false, error: "No recap found for this episode" };
    }

    const recap = rows[0];
    const recapData: RecapData = {
      podcastName: recap.podcast_name,
      episodeTitle: recap.episode_title,
      keyInsights: recap.key_insights || [],
      whatHappened: recap.what_happened || "",
      resources: recap.resources,
      tldl: recap.tldl,
    };

    console.log(`[AudioRecap] Step 1: Generating narration script for "${recap.episode_title}"...`);
    const { script, cost: scriptCost } = await generateNarrationScript(recapData, podcastSlug, episodeSlug);

    if (!script) {
      await pool.query(
        `UPDATE recap_audio SET status = 'error', error_message = 'Failed to generate narration script', updated_at = NOW()
         WHERE podcast_slug = $1 AND episode_slug = $2`,
        [podcastSlug, episodeSlug]
      );
      return { success: false, error: "Failed to generate narration script" };
    }

    console.log(`[AudioRecap] Step 2: Generating ElevenLabs audio (${script.length} chars)...`);
    const { audioBuffer, requestId, characterCount } = await generateElevenLabsAudio(script);

    console.log(`[AudioRecap] Step 3: Uploading audio to persistent storage...`);
    await uploadAudioToStorage(audioBuffer, podcastSlug, episodeSlug);

    const audioUrl = `/api/audio-recap-file/${podcastSlug}/${episodeSlug}`;
    const elevenlabsCost = estimateElevenLabsCost(characterCount);
    const totalCost = scriptCost + elevenlabsCost;
    const duration = estimateAudioDuration(characterCount);

    await logElevenLabsUsage(
      DEFAULT_MODEL_ID,
      "audio_recap_tts",
      characterCount,
      elevenlabsCost,
      { requestId, voiceId: DEFAULT_VOICE_ID, podcastSlug, episodeSlug },
      { service: "elevenlabs", podcastSlug, episodeSlug },
    );

    await pool.query(
      `UPDATE recap_audio SET
        audio_url = $3, elevenlabs_request_id = $4, voice_id = $5,
        character_count = $6, audio_duration = $7, openai_script_cost = $8,
        elevenlabs_cost = $9, total_cost = $10, narration_script = $11,
        status = 'ready', error_message = NULL, updated_at = NOW()
       WHERE podcast_slug = $1 AND episode_slug = $2`,
      [podcastSlug, episodeSlug, audioUrl, requestId, DEFAULT_VOICE_ID,
       characterCount, duration, scriptCost, elevenlabsCost, totalCost, script]
    );

    console.log(`[AudioRecap] Audio generated successfully for "${recap.episode_title}" (${duration.toFixed(0)}s, $${totalCost.toFixed(4)})`);
    return { success: true, audioUrl };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[AudioRecap] Error generating audio for ${podcastSlug}/${episodeSlug}:`, errorMsg);

    await pool.query(
      `UPDATE recap_audio SET status = 'error', error_message = $3, updated_at = NOW()
       WHERE podcast_slug = $1 AND episode_slug = $2`,
      [podcastSlug, episodeSlug, errorMsg]
    ).catch(() => {});

    return { success: false, error: errorMsg };
  }
}

export async function getRecapAudioStatus(podcastSlug: string, episodeSlug: string) {
  const { rows } = await pool.query(
    `SELECT * FROM recap_audio WHERE podcast_slug = $1 AND episode_slug = $2 LIMIT 1`,
    [podcastSlug, episodeSlug]
  );
  return rows[0] || null;
}

export async function getPlaybackStats(podcastSlug: string, episodeSlug: string) {
  const { rows } = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE event_type = 'play')::int AS play_count,
      COUNT(DISTINCT COALESCE(session_id, user_id::text)) FILTER (WHERE event_type = 'play') AS unique_listeners,
      COUNT(*) FILTER (WHERE event_type = 'complete')::int AS completion_count,
      COALESCE(AVG(percentage_reached) FILTER (WHERE event_type = 'progress'), 0) AS avg_percentage
     FROM audio_playback_events
     WHERE podcast_slug = $1 AND episode_slug = $2`,
    [podcastSlug, episodeSlug]
  );
  return rows[0] || { play_count: 0, unique_listeners: 0, completion_count: 0, avg_percentage: 0 };
}

export async function ensureRecapAudioConstraint(): Promise<void> {
  try {
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'recap_audio_podcast_episode_unique'
        ) THEN
          ALTER TABLE recap_audio ADD CONSTRAINT recap_audio_podcast_episode_unique UNIQUE (podcast_slug, episode_slug);
        END IF;
      END $$;
    `);
  } catch (err) {
    console.error("[AudioRecap] Failed to add unique constraint:", err);
  }
}
