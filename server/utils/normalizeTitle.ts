export function normalizeTitle(title: string): string {
  return title
    .replace(/\u2014/g, ' - ')
    .replace(/\u2013/g, '-')
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

export const SQL_NORMALIZE_TITLE = (col: string) =>
  `LOWER(TRIM(REGEXP_REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${col}, E'\\u2014', ' - '), E'\\u2013', '-'), E'\\u2018', ''''), E'\\u2019', ''''), E'\\u02BC', ''''), E'\\u201C', '"'), E'\\u201D', '"'), E'\\u2026', '...'), '\\s+', ' ', 'g')))`;
