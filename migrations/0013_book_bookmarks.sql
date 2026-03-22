-- Migration: Add book_bookmarks table for saving books to user library
CREATE TABLE IF NOT EXISTS book_bookmarks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  book_slug TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS book_bookmarks_user_book ON book_bookmarks (user_id, book_slug);
