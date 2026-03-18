-- One-time deduplication cleanup for episode_transcripts and landing_page_recaps
-- Executed: 2026-03-18
-- Results verified: 0 duplicate groups remain in both tables after cleanup.

-- =============================================================================
-- EPISODE TRANSCRIPTS CLEANUP
-- Duplicates: 1,366 groups with same (podcast_id, episode_title, date_published)
-- but different episode_guid (e.g. Taddy UUID vs RSS GUID)
-- =============================================================================

-- Step 1: Delete orphaned transcript_segments referencing duplicate episode_transcripts
-- Selection policy: keep the row with complete_record=true (most data), then earliest id
DELETE FROM transcript_segments
WHERE episode_guid IN (
  SELECT et.episode_guid FROM episode_transcripts et
  INNER JOIN (
    SELECT podcast_id, episode_title, date_published,
           MIN(CASE WHEN complete_record = true THEN id END) as best_complete_id,
           MIN(id) as earliest_id
    FROM episode_transcripts
    GROUP BY podcast_id, episode_title, date_published
    HAVING COUNT(*) > 1
  ) dups ON et.podcast_id = dups.podcast_id
       AND et.episode_title = dups.episode_title
       AND ((et.date_published IS NULL AND dups.date_published IS NULL) OR et.date_published = dups.date_published)
  WHERE et.id != COALESCE(dups.best_complete_id, dups.earliest_id)
);
-- Result: DELETE 14018

-- Step 2: Delete duplicate episode_transcripts
-- Selection policy: prefer complete_record=true (has transcript + description + date +
-- duration + audioUrl), then earliest id. This ensures the most data-rich row is kept.
DELETE FROM episode_transcripts
WHERE id IN (
  SELECT et.id FROM episode_transcripts et
  INNER JOIN (
    SELECT podcast_id, episode_title, date_published,
           MIN(CASE WHEN complete_record = true THEN id END) as best_complete_id,
           MIN(id) as earliest_id
    FROM episode_transcripts
    GROUP BY podcast_id, episode_title, date_published
    HAVING COUNT(*) > 1
  ) dups ON et.podcast_id = dups.podcast_id
       AND et.episode_title = dups.episode_title
       AND ((et.date_published IS NULL AND dups.date_published IS NULL) OR et.date_published = dups.date_published)
  WHERE et.id != COALESCE(dups.best_complete_id, dups.earliest_id)
);
-- Result: DELETE 1374

-- =============================================================================
-- LANDING PAGE RECAPS CLEANUP
-- Duplicates: 23 groups with same (itunes_id, episode_title, publish_date)
-- but different episode_slug (slug generation differences)
-- =============================================================================

-- Step 3: Delete orphaned episode_quotes referencing duplicate landing_page_recaps
-- Selection policy: keep the row with the richest content (scored by slug length +
-- non-null content fields + text length of key fields), then earliest id as tiebreaker.
DELETE FROM episode_quotes
WHERE (podcast_slug, episode_slug) IN (
  SELECT lpr.slug, lpr.episode_slug FROM landing_page_recaps lpr
  INNER JOIN (
    SELECT itunes_id, episode_title, publish_date,
           (SELECT id FROM landing_page_recaps lpr2
            WHERE lpr2.itunes_id = lpr_group.itunes_id
              AND lpr2.episode_title = lpr_group.episode_title
              AND lpr2.publish_date = lpr_group.publish_date
            ORDER BY
              (CASE WHEN lpr2.what_happened IS NOT NULL AND LENGTH(lpr2.what_happened) > 0 THEN LENGTH(lpr2.what_happened) ELSE 0 END
               + CASE WHEN lpr2.tldl IS NOT NULL THEN LENGTH(lpr2.tldl) ELSE 0 END
               + COALESCE(array_length(lpr2.key_insights, 1), 0) * 100
               + CASE WHEN lpr2.guests IS NOT NULL AND LENGTH(lpr2.guests) > 2 THEN 200 ELSE 0 END
               + CASE WHEN lpr2.sponsors IS NOT NULL AND LENGTH(lpr2.sponsors) > 2 THEN 100 ELSE 0 END
               + CASE WHEN lpr2.resources IS NOT NULL AND LENGTH(lpr2.resources) > 2 THEN 100 ELSE 0 END
               + CASE WHEN lpr2.show_notes IS NOT NULL AND LENGTH(lpr2.show_notes) > 0 THEN 100 ELSE 0 END
               + LENGTH(lpr2.episode_slug)) DESC,
              lpr2.id ASC
            LIMIT 1) as keep_id
    FROM (
      SELECT itunes_id, episode_title, publish_date
      FROM landing_page_recaps
      GROUP BY itunes_id, episode_title, publish_date
      HAVING COUNT(*) > 1
    ) lpr_group
  ) dups ON lpr.itunes_id = dups.itunes_id
       AND lpr.episode_title = dups.episode_title
       AND lpr.publish_date = dups.publish_date
  WHERE lpr.id != dups.keep_id
);
-- Result: DELETE 0

-- Step 4: Delete duplicate landing_page_recaps using content-richness scoring
DELETE FROM landing_page_recaps
WHERE id IN (
  SELECT lpr.id FROM landing_page_recaps lpr
  INNER JOIN (
    SELECT itunes_id, episode_title, publish_date,
           (SELECT id FROM landing_page_recaps lpr2
            WHERE lpr2.itunes_id = lpr_group.itunes_id
              AND lpr2.episode_title = lpr_group.episode_title
              AND lpr2.publish_date = lpr_group.publish_date
            ORDER BY
              (CASE WHEN lpr2.what_happened IS NOT NULL AND LENGTH(lpr2.what_happened) > 0 THEN LENGTH(lpr2.what_happened) ELSE 0 END
               + CASE WHEN lpr2.tldl IS NOT NULL THEN LENGTH(lpr2.tldl) ELSE 0 END
               + COALESCE(array_length(lpr2.key_insights, 1), 0) * 100
               + CASE WHEN lpr2.guests IS NOT NULL AND LENGTH(lpr2.guests) > 2 THEN 200 ELSE 0 END
               + CASE WHEN lpr2.sponsors IS NOT NULL AND LENGTH(lpr2.sponsors) > 2 THEN 100 ELSE 0 END
               + CASE WHEN lpr2.resources IS NOT NULL AND LENGTH(lpr2.resources) > 2 THEN 100 ELSE 0 END
               + CASE WHEN lpr2.show_notes IS NOT NULL AND LENGTH(lpr2.show_notes) > 0 THEN 100 ELSE 0 END
               + LENGTH(lpr2.episode_slug)) DESC,
              lpr2.id ASC
            LIMIT 1) as keep_id
    FROM (
      SELECT itunes_id, episode_title, publish_date
      FROM landing_page_recaps
      GROUP BY itunes_id, episode_title, publish_date
      HAVING COUNT(*) > 1
    ) lpr_group
  ) dups ON lpr.itunes_id = dups.itunes_id
       AND lpr.episode_title = dups.episode_title
       AND lpr.publish_date = dups.publish_date
  WHERE lpr.id != dups.keep_id
);
-- Result: DELETE 23
