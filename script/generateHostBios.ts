import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";
import { openai } from "../server/replit_integrations/image/client";

async function main() {
  const existingHosts = await db.execute(sql`SELECT DISTINCT podcast_slug FROM podcast_hosts`);
  const existingSlugs = new Set((existingHosts.rows as any[]).map(r => r.podcast_slug));
  console.log(`Already have hosts for: ${[...existingSlugs].join(', ')}`);

  const podcasts = await db.execute(sql`
    SELECT DISTINCT ON (slug) slug, podcast_name, hosts, tldl
    FROM landing_page_recaps
    WHERE hosts IS NOT NULL AND hosts != ''
    ORDER BY slug, created_at DESC
  `);

  const podcastsToProcess = (podcasts.rows as any[]).filter(p => !existingSlugs.has(p.slug));
  console.log(`\nProcessing ${podcastsToProcess.length} podcasts...\n`);

  const batchSize = 5;
  for (let i = 0; i < podcastsToProcess.length; i += batchSize) {
    const batch = podcastsToProcess.slice(i, i + batchSize);
    console.log(`\nBatch ${Math.floor(i/batchSize) + 1}/${Math.ceil(podcastsToProcess.length/batchSize)}: ${batch.map((p: any) => p.slug).join(', ')}`);

    const prompt = batch.map((p: any) => 
      `PODCAST: ${p.podcast_name} (slug: ${p.slug})\nHosts: ${p.hosts}\nRecent episode summary: ${p.tldl || 'N/A'}`
    ).join('\n\n---\n\n');

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a podcast researcher. For each podcast, generate detailed host bios. Return a JSON array of host objects.

Each host object must have:
- "podcastSlug": the podcast slug
- "name": host's full name
- "bio": A well-structured bio (3-4 paragraphs). Include:
  - Paragraph 1: Who they are, their main role/claim to fame
  - Paragraph 2: Career background and notable achievements
  - Paragraph 3: A header line like "Topics [Name] regularly covers:" followed by a blank line, then 4-6 bullet points starting with "• "
  
  Use double newlines (\\n\\n) between paragraphs.
  
- "twitterHandle": their X/Twitter handle without @ (or null if unknown)
- "websiteUrl": their personal/company website URL (or null if unknown)
- "linkedinUrl": their LinkedIn profile URL (or null if unknown)

For corporate/network podcasts (like NPR, TED, WSJ) where the "host" is an organization, still create an entry with the organization name and a bio about the show/network. If there are individual named hosts for these shows, create entries for those individuals instead.

If a podcast has multiple hosts, create separate entries for each individual host.

Only return the JSON array, no other text.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 4000,
        temperature: 0.7,
        response_format: { type: "json_object" }
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        console.log(`  No response for batch`);
        continue;
      }

      let hosts: any[];
      try {
        const parsed = JSON.parse(content);
        hosts = Array.isArray(parsed) ? parsed : parsed.hosts || parsed.data || Object.values(parsed)[0];
        if (!Array.isArray(hosts)) {
          console.log(`  Could not parse hosts array from response`);
          continue;
        }
      } catch (e) {
        console.log(`  JSON parse error:`, e);
        continue;
      }

      for (const host of hosts) {
        const slug = host.podcastSlug || host.podcast_slug;
        if (!slug || !host.name) continue;

        await db.execute(sql`
          INSERT INTO podcast_hosts (podcast_slug, name, bio, twitter_handle, linkedin_url, website_url, sort_order)
          VALUES (
            ${slug},
            ${host.name},
            ${host.bio || ''},
            ${host.twitterHandle || host.twitter_handle || null},
            ${host.linkedinUrl || host.linkedin_url || null},
            ${host.websiteUrl || host.website_url || null},
            ${host.sortOrder || 0}
          )
        `);
        console.log(`  ✓ Added ${host.name} for ${slug}`);
      }
    } catch (err: any) {
      console.error(`  Error processing batch:`, err.message);
    }

    if (i + batchSize < podcastsToProcess.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log('\nDone! Checking totals...');
  const totals = await db.execute(sql`
    SELECT podcast_slug, COUNT(*) as host_count 
    FROM podcast_hosts 
    GROUP BY podcast_slug 
    ORDER BY podcast_slug
  `);
  for (const r of totals.rows as any[]) {
    console.log(`  ${r.podcast_slug}: ${r.host_count} hosts`);
  }

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
