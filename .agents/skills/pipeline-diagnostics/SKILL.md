---
name: pipeline-diagnostics
description: Diagnose the episode recap pipeline (Taddy webhook → transcript → OpenAI recap → published). Use when someone reports the pipeline is broken, episodes aren't publishing, recaps are stuck, or asks to check pipeline health.
---

# Episode Pipeline Diagnostics

Run these checks in order when the pipeline may be broken. Each step narrows the problem.

## Architecture Overview

```
Taddy Webhook (POST /api/webhooks/taddy)
  → podcast_directory lookup (only tracked podcasts proceed)
  → transcript fetch (Taddy transcript API)
  → RecapGenerator (OpenAI chunked processing)
  → RecapValidator (checks required fields)
  → ProdRecap scheduler (tabloid headline, publish)
  → landing_page_recaps table (status = 'published')
```

**Key tables:** `landing_page_recaps`, `podcast_directory`
**Key files:** `server/productionRecapScheduler.ts`, `server/recapGenerator.ts`, `server/routes.ts` (webhook handler)
**Scheduler:** Runs every 5 minutes, processes 3 episodes per batch, production only.
**Timeout fix:** Episodes that timeout insert a `generation_failed` record so they won't loop.

## Step 1: Check Recent Pipeline Output (production DB)

```sql
-- Are recaps still being published?
SELECT status, COUNT(*)::int as cnt
FROM landing_page_recaps
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status ORDER BY cnt DESC;

-- Latest 5 published recaps
SELECT podcast_name, episode_title, status, created_at
FROM landing_page_recaps
ORDER BY created_at DESC LIMIT 5;
```

**Healthy:** 50+ published in last 24h, most recent within last 2 hours.
**Broken:** Zero published recently, or all stuck in non-published status.

## Step 2: Check for Stuck/Failed Jobs

```sql
-- Any generation_failed records? (timeout fix working)
SELECT podcast_name, episode_title, created_at
FROM landing_page_recaps
WHERE status = 'generation_failed'
ORDER BY created_at DESC LIMIT 10;

-- Any hidden (failed validation) records?
SELECT podcast_name, episode_title, created_at
FROM landing_page_recaps
WHERE status = 'hidden'
AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC LIMIT 10;
```

**Healthy:** Few or no generation_failed, occasional hidden is normal.
**Broken:** Many recent generation_failed = OpenAI timeouts; many hidden = validation issues.

## Step 3: Check Deployment Logs

Search production logs for these patterns:

| Pattern | What it tells you |
|---------|-------------------|
| `[ProdRecap]` | Scheduler activity — should see regular batch processing |
| `[RecapGenerator]` | OpenAI processing — "Full-transcript recap complete" = success |
| `[RecapValidator]` | Missing fields — shows what's failing validation |
| `[TaddyWebhook]` | Inbound webhooks — should see steady stream of 200s |
| `generation_failed` | Timeout records being inserted |
| `ERROR\|error\|Error` | Any errors in the pipeline |

**Healthy:** Regular `[ProdRecap]` logs every 5 min, `[RecapGenerator]` completions, all webhooks 200.
**Broken:** No `[ProdRecap]` logs = scheduler not running; Webhook errors = Taddy connection issue.

## Step 4: Check Podcast Directory

```sql
-- How many tracked podcasts?
SELECT COUNT(*)::int FROM podcast_directory WHERE status = 'published';

-- Are webhooks being ignored because podcasts aren't tracked?
-- (Check logs for "untracked podcast" messages — that's normal for podcasts we don't follow)
```

## Step 5: Check the Scheduler Is Running

In deployment logs, look for:
- `[ProdRecap] Not in production, skipping scheduler` = NOT running (dev mode)
- `[ProdRecap] Starting production recap scheduler` = Running

The scheduler only runs when `NODE_ENV=production`.

## Common Issues & Fixes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| No recaps publishing | Scheduler not running | Check NODE_ENV, redeploy |
| All recaps `generation_failed` | OpenAI API down/rate limited | Check OpenAI status, wait |
| Recaps `hidden` not `published` | Validation failing | Check `[RecapValidator]` logs for missing fields |
| Webhooks returning errors | Taddy API issue | Check webhook endpoint, Taddy status |
| Same episode retrying forever | Missing timeout fix | Deploy latest code with `generation_failed` insertion |
| No webhooks arriving | Taddy webhook config wrong | Verify webhook URL in Taddy dashboard |

## Quick Health Check (copy-paste this)

To run a fast health check, execute these two queries against production:

```sql
-- Pipeline health snapshot
SELECT
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int as last_hour,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '6 hours')::int as last_6h,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int as last_24h,
  COUNT(*) FILTER (WHERE status = 'generation_failed' AND created_at > NOW() - INTERVAL '24 hours')::int as failed_24h
FROM landing_page_recaps
WHERE status IN ('published', 'generation_failed');
```

Then check deployment logs for `[ProdRecap]` and `ERROR`.
