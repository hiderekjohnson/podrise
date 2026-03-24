import { pool } from "./db";

const TOPIC_NORMALIZATION: Record<string, string> = {
  "artificial intelligence": "AI & Technology",
  "ai": "AI & Technology",
  "machine learning": "AI & Technology",
  "deep learning": "AI & Technology",
  "llms": "AI & Technology",
  "chatgpt": "AI & Technology",
  "gpt": "AI & Technology",
  "technology": "AI & Technology",
  "tech": "AI & Technology",
  "software": "AI & Technology",
  "saas": "AI & Technology",
  "coding": "AI & Technology",
  "programming": "AI & Technology",
  "robotics": "AI & Technology",
  "automation": "AI & Technology",
  "business": "Business & Strategy",
  "entrepreneurship": "Business & Strategy",
  "startups": "Business & Strategy",
  "startup": "Business & Strategy",
  "strategy": "Business & Strategy",
  "marketing": "Business & Strategy",
  "sales": "Business & Strategy",
  "branding": "Business & Strategy",
  "growth": "Business & Strategy",
  "e-commerce": "Business & Strategy",
  "product": "Business & Strategy",
  "venture capital": "Investing & Finance",
  "investing": "Investing & Finance",
  "investment": "Investing & Finance",
  "finance": "Investing & Finance",
  "economics": "Investing & Finance",
  "economy": "Investing & Finance",
  "markets": "Investing & Finance",
  "stocks": "Investing & Finance",
  "crypto": "Investing & Finance",
  "cryptocurrency": "Investing & Finance",
  "bitcoin": "Investing & Finance",
  "real estate": "Investing & Finance",
  "wealth": "Investing & Finance",
  "personal finance": "Investing & Finance",
  "money": "Investing & Finance",
  "leadership": "Leadership & Management",
  "management": "Leadership & Management",
  "team building": "Leadership & Management",
  "hiring": "Leadership & Management",
  "decision making": "Leadership & Management",
  "psychology": "Psychology & Mindset",
  "mindset": "Psychology & Mindset",
  "mental health": "Psychology & Mindset",
  "habits": "Psychology & Mindset",
  "motivation": "Psychology & Mindset",
  "neuroscience": "Psychology & Mindset",
  "behavioral science": "Psychology & Mindset",
  "cognitive science": "Psychology & Mindset",
  "emotional intelligence": "Psychology & Mindset",
  "self-improvement": "Self-Improvement",
  "self improvement": "Self-Improvement",
  "personal development": "Self-Improvement",
  "productivity": "Self-Improvement",
  "self-help": "Self-Improvement",
  "goal setting": "Self-Improvement",
  "discipline": "Self-Improvement",
  "resilience": "Self-Improvement",
  "health": "Health & Wellness",
  "fitness": "Health & Wellness",
  "nutrition": "Health & Wellness",
  "wellness": "Health & Wellness",
  "exercise": "Health & Wellness",
  "sleep": "Health & Wellness",
  "longevity": "Health & Wellness",
  "diet": "Health & Wellness",
  "mental wellness": "Health & Wellness",
  "science": "Science",
  "physics": "Science",
  "biology": "Science",
  "climate": "Science",
  "space": "Science",
  "environment": "Science",
  "history": "History & Society",
  "politics": "History & Society",
  "geopolitics": "History & Society",
  "society": "History & Society",
  "culture": "History & Society",
  "race": "History & Society",
  "social justice": "History & Society",
  "war": "History & Society",
  "military": "History & Society",
  "religion": "History & Society",
  "philosophy": "History & Society",
  "creativity": "Creativity & Writing",
  "writing": "Creativity & Writing",
  "storytelling": "Creativity & Writing",
  "design": "Creativity & Writing",
  "art": "Creativity & Writing",
  "music": "Creativity & Writing",
  "communication": "Creativity & Writing",
  "relationships": "Relationships & Family",
  "parenting": "Relationships & Family",
  "family": "Relationships & Family",
  "dating": "Relationships & Family",
  "marriage": "Relationships & Family",
  "education": "Education",
  "learning": "Education",
  "teaching": "Education",
  "career": "Career & Work",
  "career development": "Career & Work",
  "negotiation": "Career & Work",
  "networking": "Career & Work",
  "job search": "Career & Work",
};

const VALID_TOPICS = [
  "AI & Technology",
  "Business & Strategy",
  "Investing & Finance",
  "Leadership & Management",
  "Psychology & Mindset",
  "Self-Improvement",
  "Health & Wellness",
  "Science",
  "History & Society",
  "Creativity & Writing",
  "Relationships & Family",
  "Education",
  "Career & Work",
];

async function enrichTopicsFromEpisodes(): Promise<number> {
  const { rows: books } = await pool.query(
    "SELECT id, book_key, book_title FROM book_enrichments WHERE topics = '{}' OR topics IS NULL"
  );

  if (books.length === 0) {
    console.log("[BookMeta] No books need topic enrichment");
    return 0;
  }

  const { rows: episodes } = await pool.query(
    `SELECT lpr.resources, lpr.key_topics
     FROM landing_page_recaps lpr
     WHERE lpr.resources IS NOT NULL AND lpr.resources::text != '[]'
       AND lpr.key_topics IS NOT NULL`
  );

  const bookTopicMap = new Map<string, Map<string, number>>();

  for (const ep of episodes) {
    let resources: any[];
    try {
      const parsed = typeof ep.resources === 'string' ? JSON.parse(ep.resources) : ep.resources;
      if (!Array.isArray(parsed)) continue;
      resources = parsed;
    } catch { continue; }

    let keyTopics: string[];
    try {
      if (Array.isArray(ep.key_topics)) {
        keyTopics = ep.key_topics;
      } else if (typeof ep.key_topics === 'string') {
        if (ep.key_topics.startsWith('{')) {
          keyTopics = ep.key_topics.slice(1, -1).split(',').map((s: string) => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
        } else {
          keyTopics = JSON.parse(ep.key_topics);
        }
      } else continue;
      if (!Array.isArray(keyTopics)) continue;
    } catch { continue; }

    const bookKeysInEp: string[] = [];
    for (const r of resources) {
      if (r?.type === 'book' && r.name && r.name !== '_books_checked') {
        bookKeysInEp.push(r.name.toLowerCase().trim());
      }
    }

    for (const bk of bookKeysInEp) {
      if (!bookTopicMap.has(bk)) bookTopicMap.set(bk, new Map());
      const topicCounts = bookTopicMap.get(bk)!;

      for (const kt of keyTopics) {
        const lower = kt.toLowerCase().trim();
        const directMatch = TOPIC_NORMALIZATION[lower];
        if (directMatch) {
          topicCounts.set(directMatch, (topicCounts.get(directMatch) || 0) + 1);
        } else {
          for (const [keyword, category] of Object.entries(TOPIC_NORMALIZATION)) {
            if (lower.includes(keyword) || keyword.includes(lower)) {
              topicCounts.set(category, (topicCounts.get(category) || 0) + 1);
              break;
            }
          }
        }
      }
    }
  }

  let updated = 0;
  for (const book of books) {
    const topicCounts = bookTopicMap.get(book.book_key);
    if (!topicCounts || topicCounts.size === 0) continue;

    const sorted = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([topic]) => topic);

    await pool.query(
      "UPDATE book_enrichments SET topics = $1 WHERE id = $2",
      [sorted, book.id]
    );
    updated++;
  }

  console.log(`[BookMeta] Updated topics for ${updated} books`);
  return updated;
}

async function enrichFromOpenLibrary(): Promise<number> {
  const { rows: books } = await pool.query(
    `SELECT id, book_title, author FROM book_enrichments 
     WHERE (page_count IS NULL OR publish_year IS NULL) 
     LIMIT 300`
  );

  if (books.length === 0) {
    console.log("[BookMeta] No books need Open Library enrichment");
    return 0;
  }

  let updated = 0;
  for (const book of books) {
    try {
      const q = encodeURIComponent(book.book_title);
      const url = `https://openlibrary.org/search.json?q=${q}&limit=3&fields=title,number_of_pages_median,first_publish_year,ratings_average,ratings_count`;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();

      const docs = data?.docs || [];
      let bestMatch = docs[0];
      if (book.author) {
        const authorLower = book.author.toLowerCase();
        const authorMatch = docs.find((d: any) =>
          d.author_name?.some((a: string) => a.toLowerCase().includes(authorLower.split(' ').pop() || ''))
        );
        if (authorMatch) bestMatch = authorMatch;
      }

      if (!bestMatch) continue;

      const pageCount = bestMatch.number_of_pages_median || null;
      const publishYear = bestMatch.first_publish_year || null;
      const rating = bestMatch.ratings_average ? Math.round(bestMatch.ratings_average * 10) / 10 : null;
      const ratingCount = bestMatch.ratings_count || null;

      if (pageCount || publishYear || rating) {
        await pool.query(
          `UPDATE book_enrichments SET 
            page_count = COALESCE($1, page_count),
            publish_year = COALESCE($2, publish_year),
            rating = COALESCE($3, rating),
            rating_count = COALESCE($4, rating_count)
           WHERE id = $5`,
          [pageCount, publishYear, rating, ratingCount, book.id]
        );
        updated++;
        console.log(`[BookMeta] ${book.book_title}: ${pageCount}p, ${publishYear}, ${rating}*`);
      }

      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`[BookMeta] Failed for "${book.book_title}":`, err);
    }
  }

  console.log(`[BookMeta] Updated Open Library data for ${updated} books`);
  return updated;
}

export async function enrichAllBookMetadata(): Promise<{ topics: number; openLibrary: number }> {
  const topics = await enrichTopicsFromEpisodes();
  const openLibrary = await enrichFromOpenLibrary();
  return { topics, openLibrary };
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  enrichAllBookMetadata().then(result => {
    console.log(`[BookMeta] Complete: ${result.topics} topics, ${result.openLibrary} Open Library`);
    process.exit(0);
  }).catch(err => {
    console.error("[BookMeta] Fatal:", err);
    process.exit(1);
  });
}
