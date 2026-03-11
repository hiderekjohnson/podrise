import { openai } from "./replit_integrations/image/client";
import { pool } from "./db";

interface EpisodeData {
  slug: string;
  episodeSlug: string;
  podcastName: string;
  episodeTitle: string;
  tldl: string;
  whatHappened: string;
  keyInsights: string[];
  quote: string | null;
  quoteAttribution: string | null;
  hosts: string | null;
  guests: string | null;
  keyTopics: string[] | null;
}

interface GeneratedEdition {
  headline: string;
  subheadline: string;
  body: string;
  episodeSlugs: string[];
}

export async function generateDailyDropEdition(dateStr: string): Promise<GeneratedEdition | null> {
  const { rows } = await pool.query(
    `SELECT slug, episode_slug, podcast_name, episode_title, tldl, what_happened, key_insights, quote, quote_attribution, hosts, guests, key_topics
     FROM landing_page_recaps WHERE publish_date = $1 ORDER BY id`,
    [dateStr]
  );

  if (rows.length === 0) return null;

  const episodes: EpisodeData[] = rows.map((r: any) => ({
    slug: r.slug,
    episodeSlug: r.episode_slug,
    podcastName: r.podcast_name,
    episodeTitle: r.episode_title,
    tldl: r.tldl,
    whatHappened: r.what_happened,
    keyInsights: r.key_insights || [],
    quote: r.quote,
    quoteAttribution: r.quote_attribution,
    hosts: r.hosts,
    guests: r.guests ? (typeof r.guests === 'string' ? r.guests : JSON.stringify(r.guests)) : null,
    keyTopics: r.key_topics,
  }));

  const bestEpisodes = selectBestEpisodes(episodes);

  const episodeBriefs = bestEpisodes.map((ep, i) => {
    const guestInfo = ep.guests ? ` | Guests: ${tryParseGuestNames(ep.guests)}` : "";
    return `[${i + 1}] "${ep.episodeTitle}" - ${ep.podcastName} (${ep.hosts || "Unknown host"})${guestInfo}
Summary: ${ep.tldl}
Key insight: ${ep.keyInsights[0] || "N/A"}
${ep.quote ? `Quote: "${ep.quote}" - ${ep.quoteAttribution || ep.hosts}` : ""}
Full recap link slug: /podcasts/${ep.slug}/${ep.episodeSlug}`;
  }).join("\n\n");

  const prompt = `You are the editor of "The Daily Drop" - PodCap's daily newsletter. Write today's edition for ${formatDateForPrompt(dateStr)}.

Your voice: Smart, conversational, occasionally witty. Think Morning Brew meets podcast culture. You're catching up a busy professional on the most interesting conversations that happened yesterday across the podcast world. Never clinical or listy. Always flowing, always interesting.

Here are the most noteworthy episodes from today (${episodes.length} total dropped):

${episodeBriefs}

Write a newsletter-style article. Rules:

1. HEADLINE: A catchy, specific headline that captures the day's most compelling theme or story. Not generic - something that makes you want to read. Like a newsletter subject line.

2. SUBHEADLINE: A one-line teaser that adds context (15-25 words).

3. BODY: Write 4-8 paragraphs of free-flowing narrative. This is NOT a list of episode recaps. This is a story about what happened yesterday in the podcast world. Weave the most interesting ideas, revelations, and quotes together into a cohesive read.

Guidelines for the body:
- Open with the most compelling story or idea from the day - hook the reader
- Weave between episodes naturally, like a journalist connecting stories
- Include 2-3 direct quotes from episodes, embedded naturally in the text
- For every episode or podcast you reference, include a link in markdown format: [episode title](/podcasts/slug/episode-slug). Links MUST start with a forward slash / - they are relative paths, NOT full URLs. Example: [Invest Like the Best](/podcasts/investlikethebest/shyam-sankar-celebrating-heretics-invest-like-the-best)
- Don't just summarize - editorialize lightly. What's interesting? What's the tension? What should the reader care about?
- End with a strong closer - a thought-provoking takeaway, a question, or a punchy sign-off
- Write at a 10th-grade reading level. Short sentences mixed with longer ones. Punchy paragraphs.
- You don't need to cover every episode. Focus on the 4-8 most interesting ones.
- NEVER write "X episodes dropped" or "here's what happened" type intros. Start with the story.
- Reference podcasts and episodes by linking to their recap pages using the slug format provided
- When mentioning how many conversations happened, use natural language like "across dozens of conversations" not exact counts

Respond with ONLY valid JSON (no markdown fences):
{
  "headline": "Your catchy headline",
  "subheadline": "Your teaser line",
  "body": "Your full newsletter body in markdown format. Use \\n\\n for paragraph breaks."
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
      temperature: 0.8,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    let jsonContent = content.trim();
    if (jsonContent.startsWith("```")) {
      jsonContent = jsonContent.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    const parsed = JSON.parse(jsonContent);

    return {
      headline: parsed.headline || "The Daily Drop",
      subheadline: parsed.subheadline || "",
      body: (parsed.body || "").replace(/\\n\\n/g, "\n\n").replace(/\\n/g, "\n"),
      episodeSlugs: bestEpisodes.map(ep => `${ep.slug}/${ep.episodeSlug}`),
    };
  } catch (err) {
    console.error(`[DailyDropGenerator] Failed for ${dateStr}:`, err);
    return null;
  }
}

function selectBestEpisodes(episodes: EpisodeData[]): EpisodeData[] {
  const scored = episodes.map(ep => {
    let score = 0;
    if (ep.quote) score += 2;
    if (ep.guests) score += 2;
    if (ep.keyInsights.length > 2) score += 1;
    if (ep.whatHappened && ep.whatHappened.length > 500) score += 1;
    if (ep.tldl && ep.tldl.length > 50) score += 1;
    return { ep, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const uniquePodcasts = new Set<string>();
  const selected: EpisodeData[] = [];

  for (const { ep } of scored) {
    if (selected.length >= 12) break;
    if (uniquePodcasts.has(ep.slug) && selected.length >= 6) continue;
    uniquePodcasts.add(ep.slug);
    selected.push(ep);
  }

  return selected;
}

function tryParseGuestNames(guestsJson: string): string {
  try {
    const guests = JSON.parse(guestsJson);
    if (Array.isArray(guests)) {
      return guests.map((g: any) => g.name).filter(Boolean).join(", ");
    }
    return "";
  } catch {
    return "";
  }
}

function formatDateForPrompt(dateStr: string): string {
  const parts = dateStr.split("-");
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export async function saveDailyDropEdition(dateStr: string, edition: GeneratedEdition): Promise<void> {
  await pool.query(
    `INSERT INTO daily_drop_editions (date, headline, subheadline, body, episode_slugs, generated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (date) DO UPDATE SET headline = $2, subheadline = $3, body = $4, episode_slugs = $5, generated_at = NOW()`,
    [dateStr, edition.headline, edition.subheadline, edition.body, edition.episodeSlugs]
  );
}
