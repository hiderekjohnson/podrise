import { pool } from "./db";

let state = {
  running: false,
  phase: "",
  processed: 0,
  total: 0,
  fixed: 0,
  errors: 0,
  log: [] as string[],
};

export function getEntityBackfillProgress() {
  return { ...state, log: state.log.slice(-30) };
}

export function stopEntityBackfill() {
  state.running = false;
}

function logMsg(msg: string) {
  console.log(`[EntityBackfill] ${msg}`);
  state.log.push(`${new Date().toISOString().slice(11, 19)} ${msg}`);
  if (state.log.length > 100) state.log = state.log.slice(-50);
}

export async function startEntityBackfill() {
  if (state.running) return;
  state = { running: true, phase: "people", processed: 0, total: 0, fixed: 0, errors: 0, log: [] };

  try {
    await backfillPeople();
    if (state.running) {
      state.phase = "companies";
      await backfillCompanies();
    }
    if (state.running) {
      state.phase = "mentions";
      await backfillMentions();
    }
  } catch (err: any) {
    logMsg(`Fatal error: ${err.message}`);
  }

  state.running = false;
  state.phase = "complete";
  logMsg(`Entity backfill complete: ${state.fixed} fixed, ${state.errors} errors`);
}

async function backfillPeople() {
  logMsg("=== Phase 1: Enriching People ===");

  const { rows } = await pool.query(`
    SELECT id, slug, name, bio, photo_url, title, company, twitter_handle, category, hosted_slugs
    FROM entity_people
    WHERE bio IS NULL OR bio = '' OR title IS NULL OR title = '' OR category IS NULL OR category = ''
    LIMIT 200
  `);

  state.total += rows.length;
  logMsg(`Found ${rows.length} people needing enrichment`);

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  for (const person of rows) {
    if (!state.running) break;

    try {
      const hostedPodcasts = person.hosted_slugs?.length > 0
        ? (await pool.query(`SELECT name, category FROM podcast_directory WHERE slug = ANY($1)`, [person.hosted_slugs])).rows
        : [];

      const mentionedIn = await pool.query(`
        SELECT DISTINCT pd.name, pd.category
        FROM entity_episode_mentions eem
        JOIN podcast_directory pd ON pd.slug = eem.podcast_slug
        WHERE eem.entity_type = 'person' AND eem.entity_slug = $1
        LIMIT 5
      `, [person.slug]);

      const podcastContext = [
        ...hostedPodcasts.map((p: any) => `Hosts: ${p.name} (${p.category || 'General'})`),
        ...mentionedIn.rows.map((p: any) => `Mentioned on: ${p.name} (${p.category || 'General'})`),
      ].join('\n');

      const prompt = `You are enriching data for a person in a podcast database.

Name: ${person.name}
Current Title: ${person.title || 'Unknown'}
Current Company: ${person.company || 'Unknown'}
${podcastContext ? `\nPodcast Context:\n${podcastContext}` : ''}

Return a JSON object with ONLY these fields (omit any you can't determine with reasonable confidence):
- bio: 1-2 sentence bio describing who this person is and what they're known for
- title: their professional title/role (e.g. "CEO", "Host & Comedian", "Author & Journalist")
- company: their primary company or organization
- category: best category from: "Host", "Entrepreneur", "Author", "Journalist", "Comedian", "Scientist", "Politician", "Athlete", "Actor", "Musician", "Investor", "Executive", "Expert", "Creator"

Return ONLY valid JSON, no markdown.`;

      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 300,
      });

      const text = (resp.choices[0]?.message?.content || "").trim();
      let parsed: any;
      try {
        parsed = JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
      } catch {
        state.errors++;
        state.processed++;
        continue;
      }

      const updates: string[] = [];
      const params: any[] = [person.id];
      let idx = 2;

      if ((!person.bio || person.bio === '') && parsed.bio) {
        updates.push(`bio = $${idx++}`);
        params.push(parsed.bio);
      }
      if ((!person.title || person.title === '') && parsed.title) {
        updates.push(`title = $${idx++}`);
        params.push(parsed.title);
      }
      if ((!person.company || person.company === '') && parsed.company) {
        updates.push(`company = $${idx++}`);
        params.push(parsed.company);
      }
      if ((!person.category || person.category === '') && parsed.category) {
        updates.push(`category = $${idx++}`);
        params.push(parsed.category);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        await pool.query(`UPDATE entity_people SET ${updates.join(", ")} WHERE id = $1`, params);
        state.fixed++;
        logMsg(`Enriched person "${person.name}" (${updates.length - 1} fields)`);
      }
    } catch (err: any) {
      state.errors++;
      logMsg(`Error for person "${person.name}": ${err.message?.slice(0, 100)}`);
    }

    state.processed++;
    await new Promise(r => setTimeout(r, 300));
  }

  logMsg(`People phase done: ${state.fixed} enriched`);
}

async function backfillCompanies() {
  logMsg("=== Phase 2: Enriching Companies ===");

  const { rows } = await pool.query(`
    SELECT id, slug, name, description, logo_url, industry, website_url, category
    FROM entity_companies
    WHERE description IS NULL OR description = '' OR industry IS NULL OR industry = '' OR category IS NULL OR category = ''
    LIMIT 200
  `);

  const startFixed = state.fixed;
  state.total += rows.length;
  logMsg(`Found ${rows.length} companies needing enrichment`);

  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const logoDevKey = process.env.LOGO_DEV_API_KEY;

  for (const company of rows) {
    if (!state.running) break;

    try {
      const mentionedIn = await pool.query(`
        SELECT DISTINCT pd.name, pd.category
        FROM entity_episode_mentions eem
        JOIN podcast_directory pd ON pd.slug = eem.podcast_slug
        WHERE eem.entity_type = 'company' AND eem.entity_slug = $1
        LIMIT 5
      `, [company.slug]);

      const podcastContext = mentionedIn.rows
        .map((p: any) => `Mentioned on: ${p.name} (${p.category || 'General'})`)
        .join('\n');

      const prompt = `You are enriching data for a company in a podcast database.

Company: ${company.name}
Current Industry: ${company.industry || 'Unknown'}
Website: ${company.website_url || 'Unknown'}
${podcastContext ? `\nPodcast Context:\n${podcastContext}` : ''}

Return a JSON object with ONLY these fields (omit any you can't determine):
- description: 1-2 sentence description of what the company does
- industry: industry sector (e.g. "Technology", "Media", "Finance", "Healthcare", "Retail", "Education")
- websiteUrl: company website URL if you know it (must start with https://)
- category: best category from: "Tech", "Media", "Finance", "Health", "Retail", "Food", "Entertainment", "Automotive", "Energy", "SaaS", "Crypto", "AI", "E-commerce", "Social Media", "Advertising"

Return ONLY valid JSON, no markdown.`;

      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 300,
      });

      const text = (resp.choices[0]?.message?.content || "").trim();
      let parsed: any;
      try {
        parsed = JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
      } catch {
        state.errors++;
        state.processed++;
        continue;
      }

      const updates: string[] = [];
      const params: any[] = [company.id];
      let idx = 2;

      if ((!company.description || company.description === '') && parsed.description) {
        updates.push(`description = $${idx++}`);
        params.push(parsed.description);
      }
      if ((!company.industry || company.industry === '') && parsed.industry) {
        updates.push(`industry = $${idx++}`);
        params.push(parsed.industry);
      }
      if ((!company.website_url || company.website_url === '') && parsed.websiteUrl) {
        updates.push(`website_url = $${idx++}`);
        params.push(parsed.websiteUrl);
      }
      if ((!company.category || company.category === '') && parsed.category) {
        updates.push(`category = $${idx++}`);
        params.push(parsed.category);
      }

      if ((!company.logo_url || company.logo_url === '') && logoDevKey) {
        try {
          const domain = parsed.websiteUrl || company.website_url;
          if (domain) {
            const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
            const logoUrl = `https://img.logo.dev/${cleanDomain}?token=${logoDevKey}&size=128&format=png`;
            const logoResp = await fetch(logoUrl, { method: 'HEAD' });
            if (logoResp.ok) {
              updates.push(`logo_url = $${idx++}`);
              params.push(logoUrl);
            }
          }
        } catch {}
      }

      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        await pool.query(`UPDATE entity_companies SET ${updates.join(", ")} WHERE id = $1`, params);
        state.fixed++;
        logMsg(`Enriched company "${company.name}" (${updates.length - 1} fields)`);
      }
    } catch (err: any) {
      state.errors++;
      logMsg(`Error for company "${company.name}": ${err.message?.slice(0, 100)}`);
    }

    state.processed++;
    await new Promise(r => setTimeout(r, 300));
  }

  logMsg(`Companies phase done: ${state.fixed - startFixed} enriched`);
}

async function backfillMentions() {
  logMsg("=== Phase 3: Scanning for Entity Mentions ===");

  const { rows: recaps } = await pool.query(`
    SELECT r.id, r.slug, r.episode_slug, r.podcast_name, r.episode_title,
           r.sponsors, r.guests
    FROM landing_page_recaps r
    LEFT JOIN entity_episode_mentions eem ON eem.recap_id = r.id
    WHERE eem.id IS NULL
      AND (
        (r.sponsors IS NOT NULL AND r.sponsors != '' AND r.sponsors != '[]')
        OR (r.guests IS NOT NULL AND r.guests != '' AND r.guests != '[]')
      )
    LIMIT 500
  `);

  const startFixed = state.fixed;
  state.total += recaps.length;
  logMsg(`Found ${recaps.length} episodes with sponsors/guests but no entity mentions`);

  const { rows: allPeople } = await pool.query(`SELECT slug, name, search_terms FROM entity_people`);
  const { rows: allCompanies } = await pool.query(`SELECT slug, name, search_terms FROM entity_companies`);

  const personMap = new Map<string, string>();
  for (const p of allPeople) {
    personMap.set(p.name.toLowerCase(), p.slug);
    for (const t of (p.search_terms || [])) {
      personMap.set(t.toLowerCase(), p.slug);
    }
  }
  const companyMap = new Map<string, string>();
  for (const c of allCompanies) {
    companyMap.set(c.name.toLowerCase(), c.slug);
    for (const t of (c.search_terms || [])) {
      companyMap.set(t.toLowerCase(), c.slug);
    }
  }

  for (const recap of recaps) {
    if (!state.running) break;

    try {
      let guests: any[] = [];
      let sponsors: any[] = [];
      try { guests = typeof recap.guests === 'string' ? JSON.parse(recap.guests) : (recap.guests || []); } catch {}
      try { sponsors = typeof recap.sponsors === 'string' ? JSON.parse(recap.sponsors) : (recap.sponsors || []); } catch {}

      const mentionsToInsert: Array<{type: string, slug: string, context: string}> = [];

      for (const guest of guests) {
        const guestName = typeof guest === 'string' ? guest : guest?.name;
        if (!guestName) continue;
        const slug = personMap.get(guestName.toLowerCase());
        if (slug) {
          mentionsToInsert.push({ type: 'person', slug, context: `Guest on ${recap.podcast_name}` });
        }
      }

      for (const sponsor of sponsors) {
        const sponsorName = typeof sponsor === 'string' ? sponsor : sponsor?.name;
        if (!sponsorName) continue;
        const slug = companyMap.get(sponsorName.toLowerCase());
        if (slug) {
          mentionsToInsert.push({ type: 'company', slug, context: `Sponsor of ${recap.podcast_name}` });
        }
      }

      for (const mention of mentionsToInsert) {
        await pool.query(`
          INSERT INTO entity_episode_mentions (entity_type, entity_slug, recap_id, episode_slug, podcast_slug, context, mention_count)
          VALUES ($1, $2, $3, $4, $5, $6, 1)
          ON CONFLICT (entity_type, entity_slug, recap_id) DO NOTHING
        `, [mention.type, mention.slug, recap.id, recap.episode_slug, recap.slug, mention.context]);
      }

      if (mentionsToInsert.length > 0) {
        state.fixed++;
      }
    } catch (err: any) {
      state.errors++;
    }

    state.processed++;
    if (state.processed % 100 === 0) {
      logMsg(`Mentions: processed ${state.processed}, linked ${state.fixed - startFixed}`);
    }
  }

  logMsg(`Mentions phase done: ${state.fixed - startFixed} episodes linked`);
}
