import { openai } from "./replit_integrations/image/client";
import { ITUNES_ID_TO_SLUG } from "./podcastLandingMap";
import type { InsertPodcastDeal } from "@shared/schema";

interface TranscriptInfo {
  podcastId: string;
  podcastName: string;
  episodeTitle: string;
  episodeDate: string;
  transcript: string;
}

interface ExtractedDeal {
  sponsorName: string;
  offerSummary: string;
  promoCode: string | null;
  specialLink: string | null;
  dealType: string;
  dealCategory: string | null;
}

export async function extractDealsFromTranscript(info: TranscriptInfo): Promise<InsertPodcastDeal[]> {
  const transcriptSlice = info.transcript.slice(0, 12000);
  const slug = ITUNES_ID_TO_SLUG[info.podcastId] || null;

  const prompt = `You are a podcast sponsor deal extractor. Analyze the following podcast transcript and extract any actionable sponsor deals or offers mentioned in ad reads.

ONLY include deals that have a clear redemption mechanism such as:
- A promo code
- A specific URL or landing page
- A discount percentage or dollar amount
- A free trial offer
- A free bonus item
- Instructions to mention the podcast or host name
- A unique sign-up link

DO NOT include:
- Generic sponsor mentions ("This episode is brought to you by...")
- Brand awareness ads with no offer
- Host endorsements with no specific deal
- Ads where there is no clear way for the listener to claim something

For each deal found, return a JSON object with:
- sponsorName: The brand/company name
- offerSummary: A concise one-line summary of the offer (do NOT paste the full ad)
- promoCode: The promo code if mentioned, or null
- specialLink: Any special URL mentioned, or null
- dealType: One of: "promo_code", "free_trial", "special_link", "discount", "bonus"
- dealCategory: A short category like "Health", "Finance", "Software", "Food", "Entertainment", "Shopping", "Education", or null

Return a JSON array of deal objects. If no actionable deals are found, return an empty array [].

PODCAST: ${info.podcastName}
EPISODE: ${info.episodeTitle}
DATE: ${info.episodeDate}

TRANSCRIPT:
${transcriptSlice}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You extract actionable sponsor deals from podcast transcripts. Return valid JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    const deals: ExtractedDeal[] = Array.isArray(parsed) ? parsed : (parsed.deals || []);

    return deals.map((deal) => ({
      podcastName: info.podcastName,
      podcastId: info.podcastId,
      podcastSlug: slug,
      episodeTitle: info.episodeTitle,
      episodeDate: info.episodeDate,
      sponsorName: deal.sponsorName,
      offerSummary: deal.offerSummary,
      promoCode: deal.promoCode || null,
      specialLink: deal.specialLink || null,
      dealType: deal.dealType || "discount",
      dealCategory: deal.dealCategory || null,
    }));
  } catch (err) {
    console.error(`[DealExtractor] Error extracting deals from ${info.podcastName} - ${info.episodeTitle}:`, err);
    return [];
  }
}
