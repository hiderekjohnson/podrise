import { pool } from "./db";
import { storage } from "./storage";

interface EntityDef {
  slug: string;
  name: string;
  searchTerms: string[];
  hostedSlugs?: string[];
  associatedTerms?: string[];
  type: "person" | "company";
}

const ENTITY_PEOPLE: EntityDef[] = [
  { slug: "elon-musk", name: "Elon Musk", searchTerms: ["Elon Musk"], hostedSlugs: [], type: "person" },
  { slug: "sam-altman", name: "Sam Altman", searchTerms: ["Sam Altman"], hostedSlugs: [], type: "person" },
  { slug: "mark-zuckerberg", name: "Mark Zuckerberg", searchTerms: ["Mark Zuckerberg", "Zuckerberg"], hostedSlugs: [], type: "person" },
  { slug: "jensen-huang", name: "Jensen Huang", searchTerms: ["Jensen Huang"], hostedSlugs: [], type: "person" },
  { slug: "jeff-bezos", name: "Jeff Bezos", searchTerms: ["Jeff Bezos", "Bezos"], hostedSlugs: [], type: "person" },
  { slug: "tim-cook", name: "Tim Cook", searchTerms: ["Tim Cook"], hostedSlugs: [], type: "person" },
  { slug: "satya-nadella", name: "Satya Nadella", searchTerms: ["Satya Nadella", "Nadella"], hostedSlugs: [], type: "person" },
  { slug: "sundar-pichai", name: "Sundar Pichai", searchTerms: ["Sundar Pichai"], hostedSlugs: [], type: "person" },
  { slug: "joe-rogan", name: "Joe Rogan", searchTerms: ["Joe Rogan"], hostedSlugs: ["joerogan"], type: "person" },
  { slug: "lex-fridman", name: "Lex Fridman", searchTerms: ["Lex Fridman"], hostedSlugs: ["lexfridman"], type: "person" },
  { slug: "naval-ravikant", name: "Naval Ravikant", searchTerms: ["Naval Ravikant", "Naval"], hostedSlugs: [], type: "person" },
  { slug: "peter-thiel", name: "Peter Thiel", searchTerms: ["Peter Thiel", "Thiel"], hostedSlugs: [], type: "person" },
  { slug: "chamath-palihapitiya", name: "Chamath Palihapitiya", searchTerms: ["Chamath Palihapitiya", "Chamath"], hostedSlugs: ["allin"], type: "person" },
  { slug: "marc-andreessen", name: "Marc Andreessen", searchTerms: ["Marc Andreessen", "Andreessen"], hostedSlugs: ["a16z"], type: "person" },
  { slug: "alex-hormozi", name: "Alex Hormozi", searchTerms: ["Alex Hormozi", "Hormozi"], hostedSlugs: ["alexhormozi"], type: "person" },
  { slug: "andrew-huberman", name: "Dr. Andrew Huberman", searchTerms: ["Andrew Huberman", "Huberman"], hostedSlugs: ["hubermanlab"], type: "person" },
  { slug: "scott-galloway", name: "Scott Galloway", searchTerms: ["Scott Galloway", "Galloway"], hostedSlugs: ["profgmarkets", "profgpod", "pivot"], type: "person" },
  { slug: "tim-ferriss", name: "Tim Ferriss", searchTerms: ["Tim Ferriss", "Ferriss"], hostedSlugs: ["timferriss"], type: "person" },
  { slug: "mark-cuban", name: "Mark Cuban", searchTerms: ["Mark Cuban"], hostedSlugs: [], type: "person" },
  { slug: "donald-trump", name: "Donald Trump", searchTerms: ["Donald Trump"], hostedSlugs: [], type: "person" },
  { slug: "warren-buffett", name: "Warren Buffett", searchTerms: ["Warren Buffett", "Buffett"], hostedSlugs: [], type: "person" },
  { slug: "bill-gates", name: "Bill Gates", searchTerms: ["Bill Gates"], hostedSlugs: [], type: "person" },
  { slug: "ray-dalio", name: "Ray Dalio", searchTerms: ["Ray Dalio"], hostedSlugs: [], type: "person" },
  { slug: "david-sacks", name: "David Sacks", searchTerms: ["David Sacks"], hostedSlugs: ["allin"], type: "person" },
  { slug: "jason-calacanis", name: "Jason Calacanis", searchTerms: ["Jason Calacanis", "Calacanis"], hostedSlugs: ["allin", "thisweekinstartups"], type: "person" },
  { slug: "ryan-holiday", name: "Ryan Holiday", searchTerms: ["Ryan Holiday"], hostedSlugs: ["dailystoic"], type: "person" },
  { slug: "patrick-bet-david", name: "Patrick Bet-David", searchTerms: ["Patrick Bet-David", "PBD"], hostedSlugs: ["valuetainment"], type: "person" },
  { slug: "sam-parr", name: "Sam Parr", searchTerms: ["Sam Parr"], hostedSlugs: ["myfirstmillion"], type: "person" },
  { slug: "shaan-puri", name: "Shaan Puri", searchTerms: ["Shaan Puri"], hostedSlugs: ["myfirstmillion"], type: "person" },
  { slug: "harry-stebbings", name: "Harry Stebbings", searchTerms: ["Harry Stebbings"], hostedSlugs: ["twentyminutevc"], type: "person" },
  { slug: "bill-gurley", name: "Bill Gurley", searchTerms: ["Bill Gurley"], hostedSlugs: ["bg2pod"], type: "person" },
  { slug: "keith-rabois", name: "Keith Rabois", searchTerms: ["Keith Rabois"], hostedSlugs: [], type: "person" },
  { slug: "garry-tan", name: "Garry Tan", searchTerms: ["Garry Tan"], hostedSlugs: [], type: "person" },
  { slug: "reid-hoffman", name: "Reid Hoffman", searchTerms: ["Reid Hoffman"], hostedSlugs: [], type: "person" },
  { slug: "ben-horowitz", name: "Ben Horowitz", searchTerms: ["Ben Horowitz"], hostedSlugs: [], type: "person" },
  { slug: "kara-swisher", name: "Kara Swisher", searchTerms: ["Kara Swisher"], hostedSlugs: ["pivot"], type: "person" },
  { slug: "peter-attia", name: "Peter Attia", searchTerms: ["Peter Attia"], hostedSlugs: ["peterattia"], type: "person" },
  { slug: "jordan-peterson", name: "Jordan Peterson", searchTerms: ["Jordan Peterson"], hostedSlugs: [], type: "person" },
  { slug: "brene-brown", name: "Brené Brown", searchTerms: ["Brené Brown"], hostedSlugs: ["daretolead"], type: "person" },
  { slug: "steven-bartlett", name: "Steven Bartlett", searchTerms: ["Steven Bartlett"], hostedSlugs: ["diaryofaceo"], type: "person" },
  { slug: "gary-vaynerchuk", name: "Gary Vaynerchuk", searchTerms: ["Gary Vaynerchuk", "GaryVee", "Gary Vee"], hostedSlugs: ["garyvee"], type: "person" },
  { slug: "greg-isenberg", name: "Greg Isenberg", searchTerms: ["Greg Isenberg"], hostedSlugs: [], type: "person" },
  { slug: "noah-kagan", name: "Noah Kagan", searchTerms: ["Noah Kagan"], hostedSlugs: ["noahkagan"], type: "person" },
];

const ENTITY_COMPANIES: EntityDef[] = [
  { slug: "openai", name: "OpenAI", searchTerms: ["OpenAI", "GPT-4"], associatedTerms: ["ChatGPT", "GPT-4o", "DALL-E", "Sora"], type: "company" },
  { slug: "tesla", name: "Tesla", searchTerms: ["Tesla"], type: "company" },
  { slug: "nvidia", name: "NVIDIA", searchTerms: ["NVIDIA", "Nvidia"], type: "company" },
  { slug: "google", name: "Google", searchTerms: ["Google", "Alphabet", "DeepMind"], associatedTerms: ["Gemini", "Google Cloud", "Android"], type: "company" },
  { slug: "microsoft", name: "Microsoft", searchTerms: ["Microsoft"], associatedTerms: ["Copilot", "Azure"], type: "company" },
  { slug: "apple", name: "Apple", searchTerms: ["Apple Inc", "Apple's"], associatedTerms: ["iPhone", "Apple Vision Pro"], type: "company" },
  { slug: "amazon", name: "Amazon", searchTerms: ["Amazon", "AWS"], type: "company" },
  { slug: "anthropic", name: "Anthropic", searchTerms: ["Anthropic"], associatedTerms: ["Claude"], type: "company" },
  { slug: "meta", name: "Meta", searchTerms: ["Meta Platforms", "Facebook"], associatedTerms: ["Instagram", "WhatsApp", "Threads"], type: "company" },
  { slug: "spacex", name: "SpaceX", searchTerms: ["SpaceX", "Starship", "Starlink"], type: "company" },
  { slug: "stripe", name: "Stripe", searchTerms: ["Stripe"], type: "company" },
  { slug: "shopify", name: "Shopify", searchTerms: ["Shopify"], type: "company" },
  { slug: "coinbase", name: "Coinbase", searchTerms: ["Coinbase"], type: "company" },
  { slug: "airbnb", name: "Airbnb", searchTerms: ["Airbnb"], type: "company" },
  { slug: "spotify", name: "Spotify", searchTerms: ["Spotify"], type: "company" },
  { slug: "netflix", name: "Netflix", searchTerms: ["Netflix"], type: "company" },
  { slug: "uber", name: "Uber", searchTerms: ["Uber"], type: "company" },
  { slug: "palantir", name: "Palantir", searchTerms: ["Palantir"], type: "company" },
  { slug: "crowdstrike", name: "CrowdStrike", searchTerms: ["CrowdStrike"], type: "company" },
  { slug: "salesforce", name: "Salesforce", searchTerms: ["Salesforce"], type: "company" },
  { slug: "y-combinator", name: "Y Combinator", searchTerms: ["Y Combinator", "YC"], type: "company" },
  { slug: "andreessen-horowitz", name: "Andreessen Horowitz", searchTerms: ["Andreessen Horowitz", "a16z"], type: "company" },
  { slug: "sequoia-capital", name: "Sequoia Capital", searchTerms: ["Sequoia Capital", "Sequoia"], type: "company" },
  { slug: "benchmark", name: "Benchmark", searchTerms: ["Benchmark Capital", "Benchmark"], type: "company" },
  { slug: "bitcoin", name: "Bitcoin", searchTerms: ["Bitcoin", "BTC"], type: "company" },
  { slug: "youtube", name: "YouTube", searchTerms: ["YouTube"], type: "company" },
  { slug: "tiktok", name: "TikTok", searchTerms: ["TikTok", "ByteDance"], type: "company" },
  { slug: "blackrock", name: "BlackRock", searchTerms: ["BlackRock"], type: "company" },
  { slug: "goldman-sachs", name: "Goldman Sachs", searchTerms: ["Goldman Sachs"], type: "company" },
  { slug: "jpmorgan", name: "JPMorgan Chase", searchTerms: ["JPMorgan", "JP Morgan", "Chase Bank"], type: "company" },
  { slug: "disney", name: "Disney", searchTerms: ["Disney"], type: "company" },
  { slug: "walmart", name: "Walmart", searchTerms: ["Walmart"], type: "company" },
  { slug: "xai", name: "xAI", searchTerms: ["xAI", "Grok AI"], type: "company" },
  { slug: "perplexity", name: "Perplexity", searchTerms: ["Perplexity"], type: "company" },
  { slug: "scale-ai", name: "Scale AI", searchTerms: ["Scale AI"], type: "company" },
  { slug: "databricks", name: "Databricks", searchTerms: ["Databricks"], type: "company" },
];

const AMBIGUOUS_TERMS = new Set([
  "Notion", "Oracle", "Square", "Chase", "Visa", "Benchmark", "Snowflake",
  "Perplexity", "Bain", "Citadel", "Accel", "Sequoia",
  "The Information", "The Economist",
  "Claude", "Gemini", "Slack", "Discord", "Zoom", "Toast", "Runway",
  "Cursor", "Box", "Circle"
]);

function countMentions(text: string, terms: string[], ambiguous?: Set<string>): number {
  let total = 0;
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flags = (ambiguous && ambiguous.has(term)) ? 'g' : 'gi';
    const regex = new RegExp(`\\b${escaped}\\b`, flags);
    const matches = text.match(regex);
    if (matches) total += matches.length;
  }
  return total;
}

function extractSnippets(text: string, terms: string[], count: number = 3): string[] {
  const snippets: string[] = [];
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null && snippets.length < count) {
      const start = Math.max(0, match.index - 120);
      const end = Math.min(text.length, match.index + term.length + 120);
      snippets.push(text.slice(start, end).replace(/\n/g, ' ').trim());
    }
    if (snippets.length >= count) break;
  }
  return snippets;
}

export async function generateEntityContextsForRecap(
  recapId: number,
  podcastSlug: string,
  podcastName: string,
  episodeTitle: string,
  transcript: string,
  sponsorNamesRaw?: string[],
): Promise<Record<string, string>> {
  const sponsorNames = (sponsorNamesRaw || []).map(s => s.toLowerCase());

  const podcastHosts = await storage.getHostsByPodcastSlug(podcastSlug);
  const hostNameSet = new Set(podcastHosts.map(h => h.name.toLowerCase().trim()));

  const matchedPeople = ENTITY_PEOPLE.filter(p => {
    const nameLower = p.name.toLowerCase();
    if (hostNameSet.has(nameLower)) return false;
    if (p.searchTerms.some(term => hostNameSet.has(term.toLowerCase()))) return false;
    if (p.hostedSlugs && p.hostedSlugs.includes(podcastSlug)) return false;
    return countMentions(transcript, p.searchTerms) >= 2;
  });

  const matchedCompanies = ENTITY_COMPANIES.filter(c => {
    if (sponsorNames.includes(c.name.toLowerCase())) return false;
    const allTerms = [...c.searchTerms, ...(c.associatedTerms || [])];
    return countMentions(transcript, allTerms, AMBIGUOUS_TERMS) >= 2;
  });

  const allMatched = [...matchedPeople, ...matchedCompanies];
  if (allMatched.length === 0) return {};

  const entityList = allMatched.map(e => {
    const terms = [...e.searchTerms, ...(e.type === "company" ? (e.associatedTerms || []) : [])];
    return { slug: e.slug, name: e.name, type: e.type, snippets: extractSnippets(transcript, terms) };
  });

  try {
    const { openai } = await import("./replit_integrations/image/client");
    const entityDescriptions = entityList.map(e =>
      `- ${e.name} (${e.type}): "${e.snippets.join('" | "')}"`
    ).join('\n');

    const aiResp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `For each person/company below, write ONE sentence describing the specific claim, argument, or story from this episode about them. Do NOT describe who they are generically. Write what was said about them in this episode specifically.

Since transcripts are not speaker-tagged, do NOT attribute claims to specific hosts or guests by name. Instead use passive terms: "was cited," "was highlighted," "was referenced," "was discussed."

Good examples:
- "Mark Zuckerberg was cited as an example of how radically different paths can lead to the same outcome."
- "OpenAI was highlighted as one of the best companies to join as an early employee in 2026."

Podcast: ${podcastName}
Episode: "${episodeTitle}"

Entities with transcript excerpts:
${entityDescriptions}

Respond with JSON: { "slug": "summary sentence", ... }
Use these exact slugs: ${entityList.map(e => e.slug).join(', ')}`
      }],
      max_tokens: 2000,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = aiResp.choices[0]?.message?.content;
    if (content) {
      const entityContexts = JSON.parse(content);
      if (Object.keys(entityContexts).length > 0) {
        await pool.query(
          `UPDATE landing_page_recaps SET entity_contexts_cache = $1 WHERE id = $2`,
          [JSON.stringify(entityContexts), recapId]
        );
        console.log(`[EntityGen] Cached ${Object.keys(entityContexts).length} entity contexts for "${episodeTitle.slice(0, 50)}"`);
        return entityContexts;
      }
    }
  } catch (err) {
    console.warn(`[EntityGen] AI generation failed for "${episodeTitle.slice(0, 50)}":`, err);
  }

  return {};
}
