import { storage } from "./storage";
import { openai } from "./replit_integrations/image/client";
import { searchPodcastByItunesId, getRecentEpisodesWithTranscripts, getEpisodeTranscript } from "./taddyClient";

interface PodcastInfo {
  name: string;
  id: string;
}

interface RecapResult {
  summary: string;
  dateStr: string;
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

export const DEFAULT_RECAP_PROMPT = `Then for EACH episode (only ones with new content), write a section like this:

## [PODCAST NAME IN CAPS]

**[Episode Title]**
[Guest Name if available] · [Guest Title if available] · [Duration]

🎧 [Apple Podcasts](USE_THE_APPLE_PODCASTS_URL_FROM_THE_EPISODE_DATA_ABOVE) · [Spotify](USE_THE_SPOTIFY_SEARCH_URL_FROM_THE_EPISODE_DATA_ABOVE)

**TLDL:** [2-3 sentence summary of the core thesis of the episode. Be direct and specific, not vague. TLDL stands for "Too Long, Didn't Listen".]

**What Happened**
[2-4 paragraphs telling the story of the episode in a narrative style. Walk through the conversation beat by beat — what did they open with, where did it go, what was the tension or surprise, how did it end. Write it like you're telling a friend about a conversation you overheard. Use paragraph breaks between major beats. Do NOT use bullet points here — write in flowing prose.]

**Key Insights:**
- [Specific, concrete insight #1]
- [Specific, concrete insight #2]
- [Specific, concrete insight #3]
- [Specific, concrete insight #4]

**Quote**
[Speaker name] on [topic]:
> "[A memorable, quotable line from the episode — make it feel real and punchy, the kind of thing someone would repeat at dinner]"

---

**That's your PodCap Daily. You can thank us later.**

---

IMPORTANT TONE GUIDELINES:
- Write like a sharp, well-read friend catching you up — not like a news anchor or a corporate summary
- Be specific and concrete, never vague. Say "NASA aims to land astronauts on the moon by 2028" not "The episode discussed space exploration"
- The quotes MUST be taken directly from the transcript provided. Do NOT invent or paraphrase quotes. Always attribute the quote to the speaker.
- Key insights should be specific facts or claims directly stated in the transcript, not generic observations
- Keep energy high but don't use exclamation marks excessively
- Never say "In this episode" or "The hosts discuss" — just state the ideas directly
- The "What Happened" section should read like a story, NOT a list. Use flowing paragraphs with paragraph breaks between beats.
- IMPORTANT: Use the ACTUAL Apple Podcasts and Spotify links provided in the episode data above. Do NOT make up URLs. The line with links should appear right after the episode title/guest/duration line.
- CRITICAL: NEVER fabricate, invent, or make up any quotes, facts, speaker names, guest details, or content. Every claim must come directly from the transcript. If you cannot find a good quote in the transcript, omit the Quote section for that episode rather than inventing one.`;

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

  return `You are PodCap, an AI that writes daily podcast digest emails. Generate a digest for ${p.dateContext}. Give each episode a similar-length recap — thorough but concise. Only cover podcasts that had episodes — skip any that didn't.

${p.transcriptNote}

Source episodes:
${p.episodeData}

You MUST follow this EXACT structure and tone. Write in markdown.

---

**Stats header — include this EXACTLY at the very top of the digest:**

${p.podcastNames}

**${p.totalPodcasts}** Podcasts · **${p.durationLong}** Total duration

---

${formatInstructions}`;
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
  const dateContext = mode === "latest" ? "the most recent episodes" : `episodes released on ${yesterdayLabel}`;

  for (const podcast of podcastInfos) {
    try {
      const lookupUrl = `https://itunes.apple.com/lookup?id=${podcast.id}&media=podcast&entity=podcastEpisode&limit=20&sort=recent`;
      const lookupRes = await fetch(lookupUrl);
      const lookupJson = await lookupRes.json();
      const episodes = selectEpisodes(lookupJson.results || [], mode, yesterdayStart, yesterdayEnd);

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

          const appleUrl = ep.trackViewUrl || ep.collectionViewUrl || "";
          const spotifySearchUrl = buildSpotifySearchUrl(podcast.name, ep.trackName || "");

          const episodeGuid = ep.episodeGuid || `${podcast.id}_${ep.trackId || ep.trackName}`;
          let transcriptText: string | null = null;

          const cached = await storage.getTranscriptByEpisodeGuid(episodeGuid);
          if (cached) {
            transcriptText = cached.transcript;
            console.log(`[Recap] Using cached transcript for "${ep.trackName}" (${transcriptText.length} chars)`);
          } else {
            const taddyMatch = taddyEpisodes.find((te: any) =>
              te.name?.toLowerCase().trim() === ep.trackName?.toLowerCase().trim()
            );
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
                } else {
                  console.warn(`[Recap] Taddy returned empty transcript for "${ep.trackName}" (uuid: ${taddyMatch.uuid})`);
                }
              } catch (transcriptErr) {
                console.warn(`[Recap] Transcript fetch failed for "${ep.trackName}":`, transcriptErr);
              }
            } else {
              console.warn(`[Recap] No Taddy title match for iTunes episode "${ep.trackName}" — available Taddy titles: ${taddyEpisodes.map((te: any) => te.name).join(", ")}`);
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
        } else {
          console.log(`[Recap] No transcripts found for any episodes of ${podcast.name} — skipping podcast entirely`);
        }
      }
    } catch (outerErr) {
      console.error(`[Recap] Error processing podcast ${podcast.name}:`, outerErr);
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
    max_tokens: 4000,
    temperature: 0.7,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return null;
  return { summary: content, dateStr };
}
