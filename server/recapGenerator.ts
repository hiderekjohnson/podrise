import { storage } from "./storage";
import { openai } from "./replit_integrations/image/client";
import { searchPodcastByItunesId, getRecentEpisodesWithTranscripts, getEpisodeTranscript } from "./taddyClient";

interface PodcastInfo {
  name: string;
  id: string;
}

export interface EpisodeStats {
  included: number;
  noNewEpisode: number;
  error: number;
  details: { podcast: string; status: "included" | "no_new_episode" | "error"; episodeCount?: number; errorMessage?: string }[];
}

export interface ParsedEpisode {
  podcastName: string;
  episodeTitle: string;
  episodeDuration?: string;
  episodeDate?: string;
  tldl: string;
  whatHappened: string;
  keyInsights: string[];
  quote?: string;
  quoteAttribution?: string;
}

interface RecapResult {
  summary: string;
  dateStr: string;
  episodeStats: EpisodeStats;
  parsedEpisodes: ParsedEpisode[];
}

type RecapMode = "yesterday" | "latest";

function buildSpotifySearchUrl(podcastName: string, episodeTitle: string): string {
  const query = encodeURIComponent(`${podcastName} ${episodeTitle}`);
  return `https://open.spotify.com/search/${query}`;
}

function selectEpisodes(allResults: any[], mode: RecapMode, yesterdayStart?: Date, yesterdayEnd?: Date): any[] {
  const podcastEpisodes = allResults.filter((r: any) => r.wrapperType === "podcastEpisode");

  if (mode === "yesterday" && yesterdayStart && yesterdayEnd) {
    return podcastEpisodes.filter((r: any) => {
      const releaseDate = new Date(r.releaseDate);
      return releaseDate >= yesterdayStart && releaseDate < yesterdayEnd;
    });
  }

  if (podcastEpisodes.length === 0) return [];
  podcastEpisodes.sort((a: any, b: any) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());
  return [podcastEpisodes[0]];
}

export const DEFAULT_RECAP_PROMPT = `Respond with a JSON object containing episode recaps. Each episode must include tldl, whatHappened (2-4 narrative paragraphs), keyInsights (4 bullet points), quote, and quoteAttribution. Write like a sharp friend catching someone up. Be specific and concrete. Never fabricate quotes or facts — use only what's in the transcript.`;

interface PromptParams {
  dateContext: string;
  transcriptNote: string;
  episodeData: string;
  podcastNames: string;
  totalPodcasts: number;
  durationLong: string;
  customPrompt?: string;
}

function buildPrompt(p: PromptParams): string {
  const formatInstructions = p.customPrompt || DEFAULT_RECAP_PROMPT;

  return `You are PodCap, an AI that writes daily podcast digest emails. Generate a digest for ${p.dateContext}. Give each episode a thorough recap. Only cover podcasts that had episodes.

${p.transcriptNote}

Source episodes:
${p.episodeData}

Respond ONLY with a valid JSON object (no markdown, no code fences, no extra text). The JSON must have this exact structure:

{
  "episodes": [
    {
      "podcastName": "PODCAST NAME IN CAPS",
      "episodeTitle": "The Episode Title",
      "tldl": "2-3 sentence summary of the core thesis. Be direct and specific. TLDL = Too Long Didn't Listen.",
      "whatHappened": "2-4 paragraphs telling the story of the episode in narrative style. Walk through the conversation beat by beat. Write like you're telling a friend about a conversation you overheard. Separate paragraphs with \\n\\n.",
      "keyInsights": [
        "Specific concrete insight #1",
        "Specific concrete insight #2",
        "Specific concrete insight #3",
        "Specific concrete insight #4"
      ],
      "quoteAttribution": "Speaker Name on topic",
      "quote": "A memorable quotable line from the episode taken directly from the transcript"
    }
  ]
}

RULES:
- Every episode MUST have all fields: tldl, whatHappened (2-4 paragraphs), keyInsights (exactly 4), quote, quoteAttribution
- Write like a sharp well-read friend catching you up — not a news anchor
- Be specific and concrete. Say "NASA aims to land astronauts on the moon by 2028" not "The episode discussed space exploration"
- Quotes MUST be taken directly from the transcript. Do NOT invent quotes. Always attribute to the speaker.
- Key insights should be specific facts or claims from the transcript, not generic observations
- Never say "In this episode" or "The hosts discuss" — state ideas directly
- The whatHappened section should read like a story with flowing prose, NOT bullet points
- NEVER fabricate any quotes, facts, speaker names, or content. Every claim must come from the transcript.
- Use \\n\\n to separate paragraphs in whatHappened`;
}

function normalizeTitleForMatch(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/^\d+[\.\)\-:\s]+\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[''""]/g, "'")
    .trim();
}

export async function generateRecap(
  user: { id: number; podcasts: string[] },
  yesterdayStart: Date,
  yesterdayEnd: Date,
  yesterdayLabel: string,
  dateStr: string,
  mode: RecapMode = "yesterday",
  promptOverride?: string
): Promise<RecapResult | null> {
  const podcastInfos: PodcastInfo[] = user.podcasts.map((raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      return { name: parsed.name || raw, id: parsed.id || raw };
    } catch {
      return { name: raw, id: raw };
    }
  });

  const episodeData: string[] = [];
  const podcastNamesWithEpisodes: string[] = [];
  let hasAnyEpisodes = false;
  let totalDurationMin = 0;
  const episodeMetadata: Map<string, { duration: string; date: string; podcastId: string }> = new Map();
  const dateContext = mode === "latest" ? "the most recent episodes" : `episodes released on ${yesterdayLabel}`;
  const stats: EpisodeStats = { included: 0, noNewEpisode: 0, error: 0, details: [] };

  for (const podcast of podcastInfos) {
    try {
      const lookupUrl = `https://itunes.apple.com/lookup?id=${podcast.id}&media=podcast&entity=podcastEpisode&limit=20&sort=recent`;
      const lookupRes = await fetch(lookupUrl);
      const lookupJson = await lookupRes.json();
      const episodes = selectEpisodes(lookupJson.results || [], mode, yesterdayStart, yesterdayEnd);

      if (episodes.length === 0) {
        stats.noNewEpisode++;
        stats.details.push({ podcast: podcast.name, status: "no_new_episode" });
      }

      if (episodes.length > 0) {

        let taddyPodcast: any = null;
        let taddyEpisodes: any[] = [];
        try {
          taddyPodcast = await searchPodcastByItunesId(podcast.id);
          if (taddyPodcast?.uuid) {
            taddyEpisodes = await getRecentEpisodesWithTranscripts(taddyPodcast.uuid, 10);
            console.log(`[Recap] Taddy found ${taddyEpisodes.length} episodes for ${podcast.name} (uuid: ${taddyPodcast.uuid})`);
          } else {
            console.warn(`[Recap] Taddy could not find podcast ${podcast.name} (iTunes ID: ${podcast.id})`);
          }
        } catch (taddyErr) {
          console.warn(`[Recap] Taddy lookup failed for ${podcast.name}:`, taddyErr);
        }

        const epDetails: string[] = [];
        for (const ep of episodes) {
          const durationMs = ep.trackTimeMillis || 0;
          const durationMin = Math.round(durationMs / 60000);
          totalDurationMin += durationMin;
          const durationStr = durationMin >= 60
            ? `${Math.floor(durationMin / 60)} hr ${durationMin % 60} min`
            : `${durationMin} minutes`;

          const releaseDate = ep.releaseDate ? new Date(ep.releaseDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
          const epTitle = ep.trackName || "Untitled Episode";
          episodeMetadata.set(`${podcast.name}::${epTitle}`, { duration: durationStr, date: releaseDate, podcastId: podcast.id });

          const appleUrl = ep.trackViewUrl || ep.collectionViewUrl || "";
          const spotifySearchUrl = buildSpotifySearchUrl(podcast.name, ep.trackName || "");

          const episodeGuid = ep.episodeGuid || `${podcast.id}_${ep.trackId || ep.trackName}`;
          let transcriptText: string | null = null;

          const logEvent = (eventData: Parameters<typeof storage.logTranscriptEvent>[0]) => {
            storage.logTranscriptEvent(eventData).catch(logErr => console.warn(`[Recap] Failed to log transcript event:`, logErr));
          };

          const cached = await storage.getTranscriptByEpisodeGuid(episodeGuid);
          if (cached) {
            transcriptText = cached.transcript;
            console.log(`[Recap] Using cached transcript for "${ep.trackName}" (${transcriptText.length} chars)`);
            logEvent({ userId: user.id, podcastName: podcast.name, podcastId: podcast.id, episodeTitle: ep.trackName || "", episodeGuid, status: "cached", transcriptLength: transcriptText.length });
          } else {
            const itunesNorm = normalizeTitleForMatch(ep.trackName || "");
            const taddyMatch = taddyEpisodes.find((te: any) => {
              if (!te.name) return false;
              if (te.name.toLowerCase().trim() === (ep.trackName || "").toLowerCase().trim()) return true;
              const taddyNorm = normalizeTitleForMatch(te.name);
              if (taddyNorm === itunesNorm) return true;
              if (taddyNorm.includes(itunesNorm) || itunesNorm.includes(taddyNorm)) return true;
              return false;
            });
            if (taddyMatch?.uuid) {
              try {
                const fetchedTranscript = await getEpisodeTranscript(taddyMatch.uuid);
                if (fetchedTranscript) {
                  transcriptText = fetchedTranscript;
                  console.log(`[Recap] Fetched transcript for "${ep.trackName}" (${transcriptText.length} chars)`);
                  await storage.saveTranscript({
                    podcastId: podcast.id,
                    episodeGuid,
                    episodeTitle: ep.trackName,
                    transcript: transcriptText,
                  });
                  logEvent({ userId: user.id, podcastName: podcast.name, podcastId: podcast.id, episodeTitle: ep.trackName || "", episodeGuid, taddyUuid: taddyMatch.uuid, status: "fetched", transcriptLength: transcriptText.length });
                } else {
                  console.warn(`[Recap] Taddy returned empty transcript for "${ep.trackName}" (uuid: ${taddyMatch.uuid})`);
                  logEvent({ userId: user.id, podcastName: podcast.name, podcastId: podcast.id, episodeTitle: ep.trackName || "", episodeGuid, taddyUuid: taddyMatch.uuid, status: "empty", errorMessage: "Taddy returned empty transcript" });
                }
              } catch (transcriptErr: any) {
                console.warn(`[Recap] Transcript fetch failed for "${ep.trackName}":`, transcriptErr);
                logEvent({ userId: user.id, podcastName: podcast.name, podcastId: podcast.id, episodeTitle: ep.trackName || "", episodeGuid, taddyUuid: taddyMatch.uuid, status: "error", errorMessage: transcriptErr?.message || String(transcriptErr) });
              }
            } else {
              const availableTitles = taddyEpisodes.map((te: any) => te.name).join(", ");
              console.warn(`[Recap] No Taddy title match for iTunes episode "${ep.trackName}" — available Taddy titles: ${availableTitles}`);
              logEvent({ userId: user.id, podcastName: podcast.name, podcastId: podcast.id, episodeTitle: ep.trackName || "", episodeGuid, status: "no_match", errorMessage: `No Taddy title match. Available: ${availableTitles.slice(0, 300)}` });
            }
          }

          const linksLine = `  Apple Podcasts: ${appleUrl || "N/A"}\n  Spotify Search: ${spotifySearchUrl}`;

          if (transcriptText) {
            const truncated = transcriptText.slice(0, 8000);
            epDetails.push(`- Episode: "${ep.trackName}"\n  Duration: ${durationStr}\n${linksLine}\n  Transcript (excerpt):\n${truncated}`);
          } else {
            console.log(`[Recap] Skipping episode "${ep.trackName}" (${podcast.name}) — no transcript available`);
          }
        }
        if (epDetails.length > 0) {
          hasAnyEpisodes = true;
          podcastNamesWithEpisodes.push(podcast.name);
          episodeData.push(`Podcast: ${podcast.name}\n${epDetails.join("\n")}`);
          stats.included++;
          stats.details.push({ podcast: podcast.name, status: "included", episodeCount: epDetails.length });
        } else {
          console.log(`[Recap] No transcripts found for any episodes of ${podcast.name} — skipping podcast entirely`);
          stats.error++;
          stats.details.push({ podcast: podcast.name, status: "error", errorMessage: "No transcripts available for new episodes" });
        }
      }
    } catch (outerErr) {
      console.error(`[Recap] Error processing podcast ${podcast.name}:`, outerErr);
      stats.error++;
      stats.details.push({ podcast: podcast.name, status: "error", errorMessage: outerErr instanceof Error ? outerErr.message : String(outerErr) });
    }
  }

  if (!hasAnyEpisodes) {
    console.log(`[Recap] No episodes with transcripts found for user ${user.id} — no recap generated`);
    return null;
  }

  const podcastNames = podcastNamesWithEpisodes.join(" · ");
  const totalPodcasts = podcastNamesWithEpisodes.length;

  const totalHours = Math.floor(totalDurationMin / 60);
  const totalMins = totalDurationMin % 60;
  const durationLong = totalHours > 0
    ? (totalMins > 0 ? `${totalHours} hour${totalHours !== 1 ? "s" : ""} and ${totalMins} minute${totalMins !== 1 ? "s" : ""}` : `${totalHours} hour${totalHours !== 1 ? "s" : ""}`)
    : `${totalMins} minute${totalMins !== 1 ? "s" : ""}`;

  const transcriptNote = `All episodes below include real transcript excerpts. Base ALL quotes, facts, insights, and summaries ONLY on what is explicitly stated in the transcript. NEVER fabricate, invent, or assume quotes, speaker names, facts, or details that are not directly present in the transcript text provided. If something is unclear from the transcript, omit it rather than guessing.`;

  const prompt = buildPrompt({
    dateContext,
    transcriptNote,
    episodeData: episodeData.join("\n\n"),
    podcastNames,
    totalPodcasts,
    durationLong,
    customPrompt: promptOverride,
  });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 8000,
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return null;

  let jsonContent = content.trim();
  if (jsonContent.startsWith("```")) {
    jsonContent = jsonContent.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    const parsed = JSON.parse(jsonContent);
    if (!parsed.episodes || !Array.isArray(parsed.episodes) || parsed.episodes.length === 0) {
      console.warn(`[Recap] AI returned JSON with no episodes for user ${user.id}`);
      return null;
    }

    const markdownSections: string[] = [];
    markdownSections.push(podcastNames);
    markdownSections.push("---");

    for (const ep of parsed.episodes) {
      const lines: string[] = [];
      lines.push(`## ${(ep.podcastName || "UNKNOWN PODCAST").toUpperCase()}`);
      lines.push("");
      lines.push(`**${ep.episodeTitle || "Untitled Episode"}**`);
      lines.push("");
      if (ep.tldl) {
        lines.push(`**TLDL:** ${ep.tldl}`);
        lines.push("");
      }
      if (ep.whatHappened) {
        lines.push("**What Happened**");
        lines.push(ep.whatHappened.replace(/\\n\\n/g, "\n\n").replace(/\\n/g, "\n"));
        lines.push("");
      }
      if (ep.keyInsights && Array.isArray(ep.keyInsights) && ep.keyInsights.length > 0) {
        lines.push("**Key Insights:**");
        for (const insight of ep.keyInsights) {
          lines.push(`- ${insight}`);
        }
        lines.push("");
      }
      if (ep.quote && ep.quoteAttribution) {
        lines.push("**Quote**");
        lines.push(`${ep.quoteAttribution}:`);
        lines.push(`> "${ep.quote}"`);
        lines.push("");
      }
      lines.push("---");
      markdownSections.push(lines.join("\n"));
    }

    const parsedEpisodes: ParsedEpisode[] = parsed.episodes.map((ep: any) => {
      const metaKey = `${ep.podcastName || ""}::${ep.episodeTitle || ""}`;
      const metaKeyLower = metaKey.toLowerCase();
      let meta = episodeMetadata.get(metaKey);
      if (!meta) {
        for (const [k, v] of episodeMetadata) {
          if (k.toLowerCase() === metaKeyLower) { meta = v; break; }
        }
      }
      return {
        podcastName: ep.podcastName || "Unknown Podcast",
        episodeTitle: ep.episodeTitle || "Untitled Episode",
        episodeDuration: meta?.duration,
        episodeDate: meta?.date,
        tldl: ep.tldl || "",
        whatHappened: (ep.whatHappened || "").replace(/\\n\\n/g, "\n\n").replace(/\\n/g, "\n"),
        keyInsights: Array.isArray(ep.keyInsights) ? ep.keyInsights : [],
        quote: ep.quote,
        quoteAttribution: ep.quoteAttribution,
      };
    });

    const summary = markdownSections.join("\n\n");
    return { summary, dateStr, episodeStats: stats, parsedEpisodes };
  } catch (parseErr) {
    console.warn(`[Recap] Failed to parse AI JSON response for user ${user.id}, falling back to raw content. Error:`, parseErr);
    return { summary: content, dateStr, episodeStats: stats, parsedEpisodes: [] };
  }
}
