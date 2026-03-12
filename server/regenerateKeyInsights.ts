import { pool } from "./db";
import { openai } from "./replit_integrations/image/client";

async function regenerateKeyInsights() {
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT r.id, r.slug, r.episode_title, r.podcast_name, r.itunes_id,
        r.guests, r.key_insights
      FROM landing_page_recaps r
      ORDER BY r.publish_date DESC NULLS LAST
      LIMIT 10
    `);

    console.log(`Found ${result.rows.length} recaps to update\n`);

    for (const recap of result.rows) {
      console.log(`\n[${ recap.id }] ${recap.podcast_name} — ${recap.episode_title}`);
      
      const transcriptResult = await client.query(`
        SELECT transcript FROM episode_transcripts
        WHERE podcast_id = $1 AND episode_title = $2
        LIMIT 1
      `, [recap.itunes_id?.toString(), recap.episode_title]);

      if (!transcriptResult.rows[0]?.transcript) {
        console.log("  ⚠ No transcript found, skipping");
        continue;
      }

      const transcript = transcriptResult.rows[0].transcript;
      
      let guests: any[] = [];
      try {
        const raw = recap.guests;
        if (raw) {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          guests = Array.isArray(parsed) ? parsed : [];
        }
      } catch { guests = []; }

      const guestNames = guests.map((g: any) => g.name).filter(Boolean).join(", ");
      const guestContext = guestNames ? `Guest(s): ${guestNames}` : "No guests (host-only episode)";

      const prompt = `You are PodCap, an AI that writes podcast episode recaps. Regenerate ONLY the keyInsights for this episode.

Podcast: ${recap.podcast_name}
Episode: "${recap.episode_title}"
${guestContext}

Transcript (use this as the source of truth):
${transcript}

Generate exactly 4 key takeaways. Every takeaway MUST contain:
1. A named person (the speaker or subject)
2. A specific, concrete claim
3. A named reference (person, company, book, or story from the episode)

NEVER write generic lessons like "Curiosity is important" or "Financial discipline matters."

The test: if you removed the episode title from the page, could you tell which episode this takeaway came from? If not, rewrite it.

Good examples:
- "Bill Gurley argues that obsession and curiosity - not talent - are what separate top performers, pointing to Burt Beveridge who started Tito's Vodka at 40 after a self-reflection exercise."
- "Sam Parr credits peer groups as career accelerators - he built the Anti-MBA group in San Francisco during a difficult period and calls it a turning point."

Bad examples (NEVER do this):
- "Curiosity and passion are essential for differentiating yourself."
- "Continuous learning is critical to staying relevant."

Respond ONLY with a JSON array of exactly 4 strings. No markdown, no code fences:
["Takeaway 1", "Takeaway 2", "Takeaway 3", "Takeaway 4"]`;

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 1500,
        });

        const content = response.choices[0]?.message?.content?.trim();
        if (!content) {
          console.log("  ✗ Empty response from AI");
          continue;
        }

        let insights: string[];
        try {
          insights = JSON.parse(content);
          if (!Array.isArray(insights) || insights.length === 0) {
            console.log("  ✗ Invalid JSON response");
            continue;
          }
        } catch {
          console.log("  ✗ Failed to parse JSON:", content.slice(0, 200));
          continue;
        }

        const oldInsights = Array.isArray(recap.key_insights) ? recap.key_insights : [];
        console.log("  OLD insights:");
        oldInsights.forEach((i: string, idx: number) => console.log(`    ${idx + 1}. ${i}`));
        console.log("  NEW insights:");
        insights.forEach((i: string, idx: number) => console.log(`    ${idx + 1}. ${i}`));

        await client.query(
          `UPDATE landing_page_recaps SET key_insights = $1 WHERE id = $2`,
          [insights, recap.id]
        );
        console.log("  ✓ Updated successfully");
      } catch (err: any) {
        console.log(`  ✗ Error: ${err.message}`);
      }
    }

    console.log("\n✅ Done regenerating key insights for 10 most recent recaps");
  } finally {
    client.release();
  }
}

regenerateKeyInsights().catch(console.error).finally(() => process.exit(0));
