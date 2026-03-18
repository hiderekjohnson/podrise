import { pool } from "./db";

interface RecapValidationResult {
  recapId: number;
  slug: string;
  episodeSlug: string;
  episodeTitle: string;
  missing: string[];
  fixed: string[];
  errors: string[];
}

export async function validateAndEnrichRecap(
  recapId: number,
  podcastSlug: string,
  episodeSlug: string,
  podcastName: string,
  episodeTitle: string,
  itunesId: string | null,
  transcript: string | null,
  hosts: string | null,
): Promise<RecapValidationResult> {
  const result: RecapValidationResult = {
    recapId,
    slug: podcastSlug,
    episodeSlug,
    episodeTitle,
    missing: [],
    fixed: [],
    errors: [],
  };

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, tldl, what_happened, quote, key_insights, guests, sponsors, resources,
              top_questions, topic_contexts, show_notes, apple_episode_url, spotify_episode_url,
              audio_url, tabloid_headline, tabloid_sub_headline, podcast_name, itunes_id
       FROM landing_page_recaps WHERE id = $1`,
      [recapId]
    );

    if (rows.length === 0) {
      result.errors.push("Recap not found");
      return result;
    }

    const recap = rows[0];
    const isEmpty = (v: any) => v === null || v === undefined || v === "" || v === "[]";

    if (isEmpty(recap.tldl)) result.missing.push("tldl");
    if (isEmpty(recap.quote)) result.missing.push("quote");
    if (isEmpty(recap.show_notes)) result.missing.push("show_notes");
    if (isEmpty(recap.apple_episode_url)) result.missing.push("apple_url");
    if (isEmpty(recap.spotify_episode_url)) result.missing.push("spotify_url");
    if (isEmpty(recap.audio_url)) result.missing.push("audio_url");
    if (isEmpty(recap.tabloid_headline)) result.missing.push("tabloid");
    if (isEmpty(recap.topic_contexts)) result.missing.push("topic_contexts");
    if (isEmpty(recap.top_questions)) result.missing.push("top_questions");
    if (isEmpty(recap.resources)) result.missing.push("resources");
    if (isEmpty(recap.guests)) result.missing.push("guests");
    if (isEmpty(recap.sponsors)) result.missing.push("sponsors");

    const { rows: quoteRows } = await client.query(
      `SELECT COUNT(*) as cnt FROM episode_quotes WHERE podcast_slug = $1 AND episode_slug = $2`,
      [podcastSlug, episodeSlug]
    );
    if (parseInt(quoteRows[0]?.cnt || "0") === 0) result.missing.push("quotes_db");

    const { rows: productRows } = await client.query(
      `SELECT COUNT(*) as cnt FROM extracted_products WHERE podcast_slug = $1 AND episode_slug = $2`,
      [podcastSlug, episodeSlug]
    );
    if (parseInt(productRows[0]?.cnt || "0") === 0) result.missing.push("products");

    if (result.missing.length === 0) {
      return result;
    }

    console.log(`[RecapValidator] Episode "${episodeTitle.slice(0, 50)}" missing: ${result.missing.join(", ")}`);

    if (result.missing.includes("tabloid") && !isEmpty(recap.tldl) && !isEmpty(recap.what_happened)) {
      try {
        const { generateTabloidHeadline } = await import("./emailScheduler");
        let keyInsights: string[] = [];
        try {
          if (typeof recap.key_insights === "string") keyInsights = JSON.parse(recap.key_insights);
          else if (Array.isArray(recap.key_insights)) keyInsights = recap.key_insights;
        } catch {}
        const tabloidResult = await generateTabloidHeadline(
          episodeTitle, podcastName, recap.tldl, recap.what_happened, keyInsights
        );
        if (tabloidResult) {
          await client.query(
            `UPDATE landing_page_recaps SET tabloid_headline = $1, tabloid_sub_headline = $2 WHERE id = $3`,
            [tabloidResult.tabloidHeadline, tabloidResult.tabloidSubHeadline, recapId]
          );
          result.fixed.push("tabloid");
        }
      } catch (err: any) {
        result.errors.push(`tabloid: ${err.message?.slice(0, 80)}`);
      }
    }

    if (result.missing.includes("spotify_url")) {
      try {
        const { searchSpotifyEpisode } = await import("./spotifyClient");
        const spotifyUrl = await searchSpotifyEpisode(podcastName, episodeTitle);
        if (spotifyUrl) {
          await client.query(
            `UPDATE landing_page_recaps SET spotify_episode_url = $1 WHERE id = $2`,
            [spotifyUrl, recapId]
          );
          result.fixed.push("spotify_url");
        }
      } catch (err: any) {
        result.errors.push(`spotify: ${err.message?.slice(0, 80)}`);
      }
    }

    if (result.missing.includes("quotes_db") && transcript) {
      try {
        const { extractQuotesFromTranscript } = await import("./recapGenerator");
        const guestsStr = !isEmpty(recap.guests) ? recap.guests : null;
        const extractedQuotes = await extractQuotesFromTranscript(
          transcript, podcastName, episodeTitle, hosts, guestsStr
        );
        if (extractedQuotes.length > 0) {
          const { storage } = await import("./storage");
          const quotesToSave = extractedQuotes.map((q: any) => ({
            podcastSlug,
            episodeSlug,
            speakerName: q.speakerName,
            speakerRole: q.speakerRole || null,
            quoteText: q.quoteText,
            context: q.context,
            quoteType: q.quoteType,
          }));
          await storage.saveEpisodeQuotes(quotesToSave);
          result.fixed.push(`quotes_db(${extractedQuotes.length})`);
        }
      } catch (err: any) {
        result.errors.push(`quotes_db: ${err.message?.slice(0, 80)}`);
      }
    }

    if (result.missing.includes("apple_url") && itunesId) {
      try {
        const lookupUrl = `https://itunes.apple.com/lookup?id=${itunesId}&media=podcast&entity=podcastEpisode&limit=25`;
        const resp = await fetch(lookupUrl);
        const data = await resp.json();
        const eps = (data.results || []).filter((r: any) => r.wrapperType === "podcastEpisode");
        const titleLower = episodeTitle.toLowerCase().trim();
        const matched = eps.find((e: any) => (e.trackName || "").toLowerCase().trim() === titleLower);
        if (matched?.trackViewUrl) {
          await client.query(
            `UPDATE landing_page_recaps SET apple_episode_url = $1 WHERE id = $2`,
            [matched.trackViewUrl.replace(/&uo=\d+/, ""), recapId]
          );
          result.fixed.push("apple_url");
        }
        if (!recap.audio_url && matched?.episodeUrl) {
          await client.query(
            `UPDATE landing_page_recaps SET audio_url = $1 WHERE id = $2`,
            [matched.episodeUrl, recapId]
          );
          result.fixed.push("audio_url");
        }
      } catch (err: any) {
        result.errors.push(`apple: ${err.message?.slice(0, 80)}`);
      }
    }

    const fixedCount = result.fixed.length;
    const stillMissing = result.missing.filter(f => !result.fixed.includes(f) && !result.fixed.some(fx => fx.startsWith(f)));
    if (fixedCount > 0) {
      console.log(`[RecapValidator] Fixed ${fixedCount} fields for "${episodeTitle.slice(0, 50)}": ${result.fixed.join(", ")}`);
    }
    if (stillMissing.length > 0) {
      console.warn(`[RecapValidator] Still missing for "${episodeTitle.slice(0, 50)}": ${stillMissing.join(", ")}`);
    }
    if (result.errors.length > 0) {
      console.error(`[RecapValidator] Errors for "${episodeTitle.slice(0, 50)}": ${result.errors.join("; ")}`);
    }

    return result;
  } finally {
    client.release();
  }
}
