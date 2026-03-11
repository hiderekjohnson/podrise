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
  const bestSlugs = new Set(bestEpisodes.map(ep => `${ep.slug}/${ep.episodeSlug}`));

  const episodeBriefs = bestEpisodes.map((ep, i) => {
    const guestInfo = ep.guests ? ` | Guests: ${tryParseGuestNames(ep.guests)}` : "";
    return `[${i + 1}] "${ep.episodeTitle}" - ${ep.podcastName} (${ep.hosts || "Unknown host"})${guestInfo}
Summary: ${ep.tldl}
Key insight: ${ep.keyInsights[0] || "N/A"}
${ep.quote ? `Quote: "${ep.quote}" - ${ep.quoteAttribution || ep.hosts}` : ""}
Full recap link slug: /podcasts/${ep.slug}/${ep.episodeSlug}`;
  }).join("\n\n");

  const bonusEpisodes = episodes.filter(ep => !bestSlugs.has(`${ep.slug}/${ep.episodeSlug}`));
  const bonusBriefs = bonusEpisodes.slice(0, 25).map(ep =>
    `"${ep.episodeTitle}" - ${ep.podcastName} (${ep.hosts || "Unknown host"}) | Summary: ${ep.tldl} | Link: /podcasts/${ep.slug}/${ep.episodeSlug}`
  ).join("\n");

  const prompt = `You are writing The Daily Drop for ${formatDateForPrompt(dateStr)}.

THE DAILY DROP is a daily newsletter for avid podcast listeners. It is NOT a news recap. It is a podcast recap. Think of it like a trade publication for the podcast world, written by an in-house editorial team that listens so the reader doesn't have to.

The reader loves podcasts, is always looking for their next great listen, and wants to know: what dropped yesterday that was worth their time? Who were the big guests? What did someone say that's getting people talking? Which show just landed a massive booking?

WHO IS WRITING THIS: The newsletter comes from an editorial team genuinely obsessed with podcasts. The voice is warm, knowledgeable, and a little opinionated. It feels like a recommendation from a friend who has great taste, not a press release or an AI summary. The writing should feel authored, not assembled. One curious human mind connecting the dots across everything they heard yesterday.

Here are the most noteworthy episodes from yesterday:

${episodeBriefs}

Here are additional episodes from yesterday that didn't make the main newsletter:

${bonusBriefs}

WHAT TO COVER - Focus on the podcast ECOSYSTEM, not just topics discussed:
- What was the best episode yesterday and why?
- Who was the big guest booking? Why does that booking matter for that show?
- Is someone showing up everywhere right now? Call it out
- Did a smaller show land a massive get? Celebrate it
- What's a conversation people in the podcast world will be talking about?
- Was there an episode that went somewhere unexpected or unusually raw?
- What's the one episode you'd recommend to a friend today?
- You are covering the bookings, the moments, the shows, the hosts, not just summarizing what the guests talked about

WHAT NOT TO DO:
- Don't just summarize episode content. Cover the shows and why the episodes matter
- Don't treat every episode equally. Have a point of view on what was best
- Don't be political. Present all political content with the same analytical curiosity. Focus on strategy, mechanics, consequences, never on whether something is good or bad. The reader should never tell which side the editorial team sits on
- Don't open with a summary. Open with a recommendation or an observation that pulls the reader in
- Don't be vague. Name the show. Name the host. Name the guest. Be specific
- Don't default to the same big-name shows every edition. Actively surface shows that don't have massive audiences. Include at least one or two picks that feel like genuine discoveries: a niche show, an indie host who landed a great guest, a conversation in a corner of the podcast world most people haven't found
- If every edition is just the usual suspects, it's a failure

VOICE AND TONE:
- Evangelical about podcasts: you want the reader to care as much as you do
- You've done the homework, your enthusiasm has receipts
- Slight urgency underneath everything: "you need to hear this"
- Warm but never gushing. Opinionated but never dismissive
- You sound like someone who listens to 10 podcasts a day and genuinely loves it
- Never sounds like AI. Never sounds like a press release. Never sounds like a summary
- Reads like a knowledgeable friend texting you: "okay you have to listen to this one"

STRUCTURE:
1. TAGLINE: One line that captures the mood or theme of that day's episodes (10-20 words). This sits below "The Daily Drop" header.

2. BODY: ~550 words of flowing prose. No bullets, no subheadings, no headers mid-newsletter.
   - Open with the strongest recommendation or most interesting booking of the day. Pull the reader in immediately
   - Each episode mention should feel like a recommendation, not a report
   - Show titles in *italics* (markdown)
   - Close with a simple, warm one-liner inviting the reader to share what they listened to. Keep it conversational and grounded, not corny or over-the-top. Example: "Heard something great yesterday? Let us know." Do NOT use cheesy catchphrases, pop culture references, or try-hard sign-offs. No "see you tomorrow, heretics" type closings. Just be a normal, friendly person wrapping up a note

3. ALSO WORTH CHECKING OUT: After the sign-off, write a short "Also worth checking out" section. Pick 5-7 episodes from the ADDITIONAL episodes list (NOT from the main newsletter episodes). Write it as 1-2 flowing sentences, not a list. Link each episode title to its episode page using markdown links. Keep it brief and punchy, like a bonus tip from a friend. Prioritize interesting or lesser-known episodes that deserve attention over big-name shows. This section should feel like a casual postscript.

LINKING RULES:
- Include 6-10 links naturally woven in. Use markdown links
- For episode titles or show names: link to [show or episode title](/podcasts/slug/episode-slug). Links MUST start with a forward slash / - they are relative paths, NOT full URLs
- For notable people mentioned (guests, hosts, public figures): link to their PodCap page if one might exist, e.g. [Elon Musk](/people/elon-musk). Use the format /people/{first-last} with lowercase and hyphens. Only do this for well-known people who likely have a page
- For notable companies mentioned (Palantir, Tesla, OpenAI, etc.): link to their PodCap page if one might exist, e.g. [Palantir](/companies/palantir). Use the format /companies/{slug} with lowercase. Only do this for well-known companies
- Don't over-link. If a name is mentioned in passing, skip it. Link a show, person, or company once, then leave subsequent mentions unlinked
- Links should sit on meaningful anchor text: show names, guest names, company names, episode titles. Never "click here" or "this episode"
- Internal links (to /podcasts/, /people/, /companies/) are preferred over external links for SEO. Only link externally if there is no internal page

CONSTRAINTS:
- Include 2-3 direct quotes from episodes, embedded naturally
- Never use em dashes. Use commas, periods, or just start a new sentence instead
- Keep all proper nouns, names, show titles, and factual claims accurate and intact
- NEVER write "X episodes dropped" or "here's what we're covering" type intros

Respond with ONLY valid JSON (no markdown fences):
{
  "headline": "The tagline - one line capturing the mood/theme of the day",
  "subheadline": "Your daily guide to what's worth listening to across the podcast world.",
  "body": "Your full newsletter body in markdown format. Use \\n\\n for paragraph breaks. Close with the community invitation line.",
  "alsoWorthCheckingOut": "1-2 flowing sentences with 5-7 linked episode titles from the bonus list. Not a bullet list. Brief and punchy."
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 3000,
      temperature: 0.85,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    let jsonContent = content.trim();
    if (jsonContent.startsWith("```")) {
      jsonContent = jsonContent.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    const parsed = JSON.parse(jsonContent);

    const mainBody = (parsed.body || "").replace(/\\n\\n/g, "\n\n").replace(/\\n/g, "\n");
    const bonusSection = parsed.alsoWorthCheckingOut
      ? (parsed.alsoWorthCheckingOut || "").replace(/\\n\\n/g, "\n\n").replace(/\\n/g, "\n")
      : "";
    const fullBody = bonusSection
      ? `${mainBody}\n\n**Also worth checking out:** ${bonusSection}`
      : mainBody;

    return {
      headline: parsed.headline || "The Daily Drop",
      subheadline: parsed.subheadline || "",
      body: fullBody,
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
