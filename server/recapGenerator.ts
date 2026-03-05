import { storage } from "./storage";
import { openai } from "./replit_integrations/image/client";
import { searchPodcastByItunesId, getRecentEpisodesWithTranscripts } from "./taddyClient";

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

function formatDuration(totalMinutes: number): string {
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours}h ${String(mins).padStart(2, "0")}m` : `${hours}h 00m`;
  }
  return `${totalMinutes}m`;
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

export async function generateRecap(
  user: { id: number; podcasts: string[]; readingLength?: number | null },
  yesterdayStart: Date,
  yesterdayEnd: Date,
  yesterdayLabel: string,
  dateStr: string,
  mode: RecapMode = "yesterday"
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
  let hasTranscripts = false;
  let totalDurationMin = 0;

  const dateContext = mode === "latest" ? "the most recent episodes" : `episodes released on ${yesterdayLabel}`;
  const noEpisodesMsg = mode === "latest" ? "No episodes found." : "No new episodes released yesterday.";

  for (const podcast of podcastInfos) {
    try {
      const lookupUrl = `https://itunes.apple.com/lookup?id=${podcast.id}&media=podcast&entity=podcastEpisode&limit=20&sort=recent`;
      const lookupRes = await fetch(lookupUrl);
      const lookupJson = await lookupRes.json();
      const episodes = selectEpisodes(lookupJson.results || [], mode, yesterdayStart, yesterdayEnd);

      if (episodes.length > 0) {
        hasAnyEpisodes = true;
        podcastNamesWithEpisodes.push(podcast.name);

        let taddyPodcast: any = null;
        let taddyEpisodes: any[] = [];
        try {
          taddyPodcast = await searchPodcastByItunesId(podcast.id);
          if (taddyPodcast?.uuid) {
            taddyEpisodes = await getRecentEpisodesWithTranscripts(taddyPodcast.uuid, 10);
          }
        } catch (taddyErr) {
          console.warn(`Taddy lookup failed for ${podcast.name}:`, taddyErr);
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
          } else {
            const taddyMatch = taddyEpisodes.find((te: any) =>
              te.name?.toLowerCase().trim() === ep.trackName?.toLowerCase().trim()
            );
            if (taddyMatch?.transcript) {
              transcriptText = taddyMatch.transcript;
              await storage.saveTranscript({
                podcastId: podcast.id,
                episodeGuid,
                episodeTitle: ep.trackName,
                transcript: transcriptText,
              });
            }
          }

          const linksLine = `  Apple Podcasts: ${appleUrl || "N/A"}\n  Spotify Search: ${spotifySearchUrl}`;

          if (transcriptText) {
            hasTranscripts = true;
            const truncated = transcriptText.slice(0, 8000);
            epDetails.push(`- Episode: "${ep.trackName}"\n  Duration: ${durationStr}\n${linksLine}\n  Transcript (excerpt):\n${truncated}`);
          } else {
            epDetails.push(`- Episode: "${ep.trackName}"\n  Duration: ${durationStr}\n${linksLine}\n  Description: ${(ep.description || "No description available.").slice(0, 500)}`);
          }
        }
        episodeData.push(`Podcast: ${podcast.name}\n${epDetails.join("\n")}`);
      } else {
        episodeData.push(`Podcast: ${podcast.name}\n- ${noEpisodesMsg}`);
      }
    } catch {
      episodeData.push(`**${podcast.name}**\n- Could not fetch episodes.`);
    }
  }

  if (!hasAnyEpisodes) {
    return null;
  }

  const readingMinutes = user.readingLength || 10;
  const podcastNames = podcastNamesWithEpisodes.join(" · ");
  const totalPodcasts = podcastNamesWithEpisodes.length;
  const timeSavedMin = Math.max(0, totalDurationMin - readingMinutes);

  const transcriptNote = hasTranscripts
    ? "Some episodes below include real transcript excerpts — use these for accurate quotes, specific facts, and concrete insights. For episodes with only descriptions, do your best based on the available info."
    : "Note: No full transcripts were available for these episodes, so you are working from episode descriptions only. Do your best to infer specific content.";

  const prompt = `You are PodCap, an AI that writes daily podcast digest emails. Generate a digest for ${dateContext}. The summary should take approximately ${readingMinutes} minutes to read. Only cover podcasts that had episodes — skip any that didn't.

${transcriptNote}

Source episodes:
${episodeData.join("\n\n")}

You MUST follow this EXACT structure and tone. Write in markdown.

---

**Stats header — include this EXACTLY at the very top of the digest, before Big Ideas Today:**

${podcastNames}

**${totalPodcasts}** Podcasts · **${formatDuration(totalDurationMin)}** Total runtime · **${readingMinutes} min** Your recap · **${formatDuration(timeSavedMin)}** Time saved

---

## Big Ideas Today

For each episode that had new content, write one punchy one-liner takeaway. Format each as:

🚀 **[One bold sentence summarizing the biggest idea]**
*Source: [Podcast Name]*

(Use relevant emojis: 🚀 🤖 💰 🧠 🔬 💡 📈 🎯 🌍 etc. One per idea.)

---

Then for EACH episode (only ones with new content), write a section like this:

## [PODCAST NAME IN CAPS]

**[Episode Title]**
[Guest Name if available] · [Guest Title if available] · [Duration]

🎧 [Apple Podcasts](USE_THE_APPLE_PODCASTS_URL_FROM_THE_EPISODE_DATA_ABOVE) · [Spotify](USE_THE_SPOTIFY_SEARCH_URL_FROM_THE_EPISODE_DATA_ABOVE)

**TL;DR:** [2-3 sentence summary of the core thesis of the episode. Be direct and specific, not vague.]

**[Discussion Label — choose one: "What They Talk About" / "What They Debate" / "What [Host] Focuses On" / "What They Explain"]**
[2-3 sentences describing the dynamic of the conversation. Who pushes back on what? What's the tension? What angle do they explore? Make it feel like you listened.]

**Key Insights:**
- [Specific, concrete insight #1]
- [Specific, concrete insight #2]
- [Specific, concrete insight #3]
- [Specific, concrete insight #4]

> "[A memorable, quotable line from the episode — make it feel real and punchy, the kind of thing someone would repeat at dinner]"

---

## Conversation Ammo

*If you repeat one idea today, make it this:*

**[Topic Tag]** — [A conversational one-liner someone could casually bring up. Written as "Someone argued..." or "Apparently..." or a surprising fact.]

**[Topic Tag]** — [Another one-liner from a different episode]

**[Topic Tag]** — [A third one-liner from a different episode]

---

**That's your PodCap Daily.**

---

IMPORTANT TONE GUIDELINES:
- Write like a sharp, well-read friend catching you up — not like a news anchor or a corporate summary
- Be specific and concrete, never vague. Say "NASA aims to land astronauts on the moon by 2028" not "The episode discussed space exploration"
- The hook quotes should feel real — punchy, conversational, the kind of thing someone actually said
- Key insights should be specific facts or claims, not generic observations
- Conversation Ammo should be things someone could casually say at dinner or in a meeting
- Keep energy high but don't use exclamation marks excessively
- Never say "In this episode" or "The hosts discuss" — just state the ideas directly
- IMPORTANT: Use the ACTUAL Apple Podcasts and Spotify links provided in the episode data above. Do NOT make up URLs. The line with links should appear right after the episode title/guest/duration line.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: hasTranscripts ? 4000 : 3000,
    temperature: 0.7,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return null;
  return { summary: content, dateStr };
}
