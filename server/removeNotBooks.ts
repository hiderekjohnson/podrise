import pg from "pg";
import fs from "fs";
import path from "path";

const COVERS_DIR = path.resolve("public/books");

const NOT_BOOKS = [
  "Alison Roman's Cookbooks",
  "Ancestry.com",
  "Anxious Generation Write",
  "Bad Art",
  "Blade Runner",
  "Boyhood",
  "Bruce Springsteen's Autobiography",
  "Copy That!",
  "E.P. Taylor biography",
  "Eternal Sunshine of the Spotless Mind",
  "Ferris Bueller's Day Off",
  "Find the Work You Love",
  "Good Will Hunting",
  "Harry Potter Series",
  "How to Be an Amazing C Programmer",
  "Jack Hanfield book about Schofield Bible",
  "Jiro Dreams of Sushi",
  "Leads Book",
  "Love Actually",
  "Mark Hyman's new book",
  "Michael Dell's Autobiography",
  "Michael Ovitz's Book",
  "Nick Sleep Letters",
  "No Dumb Questions",
  "Offers",
  "Peter Thiel's Stanford Class Notes",
  "Planet Money Book",
  "QBio",
  "Rang De Basanti",
  "Run Ricky Run",
  "Running for Good: The Fiona Oakes Documentary",
  "Software 2.0",
  "Songs in the Key of Life",
  "Steve's Book on Investing",
  "Supremecy",
  "The Big Oops",
  "The Defiant Ones",
  "The Founders Podcast",
  "The Four Christmases",
  "The Gary Halbert Letter",
  "The Hustle: 100 Side Hustle Ideas",
  "The Milk Road",
  "The Sequoia Memo: YouTube's Investment Memo",
  "The Steve Jobs Stanford Commencement Speech",
  "The Walt Disney Biography",
  "The Yoga Body",
  "Train Hard, Win Easy",
  "Trust No One: The Hunt for the Crypto King",
  "WTF Happened in 1971?",
  "When Harry Met Sally",
  "Where Dreams Go to Die",
  "The World Record Breaking Book",
  "This Is the Moment",
  "Things Become Other Things",
  "The Banana Man: The History of Sam Zemurray",
  "If Anyone Builds It, Everyone Dies",
  "Basic Journalism: Exploring the Fundamentals",
  "Building Your Own Yacht",
  "Father, Mother, Sister, Brother",
  "How Japan Saved American Fashion",
  "Kisa by Kisa",
  "Mastermind",
  "Planet Money: A Guide to the Hidden Forces That Shape Your Life",
  "Sometimes a Part, Always in My Heart",
  "The French Illusion",
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  console.log(`Checking ${NOT_BOOKS.length} non-book entries...\n`);
  if (dryRun) console.log("DRY RUN — no deletions\n");

  let removed = 0;
  let notFound = 0;

  for (const title of NOT_BOOKS) {
    const { rows } = await pool.query(
      `SELECT id, book_key, slug FROM book_enrichments WHERE book_title = $1 LIMIT 1`,
      [title]
    );

    if (rows.length === 0) {
      notFound++;
      console.log(`  ? Not found: "${title}"`);
      continue;
    }

    const book = rows[0];

    if (dryRun) {
      console.log(`  ✗ Would remove: "${title}" (id: ${book.id})`);
      continue;
    }

    await pool.query(
      `INSERT INTO book_blocklist (book_key, book_title, reason) VALUES ($1, $2, 'not_a_book') ON CONFLICT (book_key) DO NOTHING`,
      [book.book_key, title]
    );

    const filePath = path.join(COVERS_DIR, `${book.slug}.jpg`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`  ✗ Removed: "${title}" (+ deleted cover file)`);
    } else {
      console.log(`  ✗ Removed: "${title}"`);
    }

    await pool.query(`DELETE FROM book_aliases WHERE canonical_key = $1 OR alias_key = $1`, [book.book_key]);
    await pool.query(`DELETE FROM book_enrichments WHERE id = $1`, [book.id]);
    removed++;
  }

  console.log(`\nDone! Removed: ${removed}, Not found: ${notFound}`);
  const { rows: remaining } = await pool.query(`SELECT COUNT(*) FROM book_enrichments WHERE slug IS NOT NULL`);
  console.log(`Remaining books: ${remaining[0].count}`);

  await pool.end();
}

main().catch(console.error);
