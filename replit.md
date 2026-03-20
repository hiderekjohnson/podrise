# PodRise - Daily Podcast Digest

## Overview
PodRise is a full-stack web application designed to provide personalized daily podcast digest subscriptions. It enables users to manage their podcast selections, receive AI-generated recaps, and access detailed episode information. The project aims to simplify podcast discovery, deliver personalized audio content, and enhance user engagement, aspiring to become a leading platform in the personalized podcast consumption market. Key capabilities include AI-powered content summarization, personalized recommendations, and a comprehensive admin suite for content and user management.

## User Preferences
- **User Data Safety**: NEVER bulk-delete user accounts. All user accounts are real users. Only delete individual accounts via the admin panel delete button (with confirmation). The 8 core user accounts are: ss@contactsheet.org, johnsonjessicanoel@gmail.com, hiderekjohnson@gmail.com, kpfitz@gmail.com, alexdmitt@gmail.com, brissonemail@gmail.com, badonnelly84@gmail.com, ru1@mac.com

## System Architecture
**Frontend**: Built with React, Vite, Tailwind CSS, Shadcn UI, `wouter` for routing, and `framer-motion` for animations. The UI adheres to WCAG AA accessibility standards, featuring DM Sans, DM Mono, and DM Serif Display fonts, an indigo/violet brand palette, and an inline SVG wordmark logo.
**Backend**: An Express.js server handles API requests and user sessions.
**Database**: PostgreSQL is used with Drizzle ORM and connection pooling for efficient data management.
**Authentication**: A dual session and JWT token authentication system supports email magic links and Google OAuth for web, and JWT Bearer tokens for mobile applications.
**Mobile API**: Dedicated endpoints are provided for an iOS companion app, covering registration, login, token management, and push notifications via Apple Push Notification Service (APNs).
**Onboarding**: A streamlined single-step onboarding process follows email verification, guiding users through podcast selection with smart suggestions.
**AI Integration**: Utilizes OpenAI (GPT-4o, GPT-4o-mini) for 2-pass recap generation, key takeaways, episode chat, and entity detection. AI prompt logic is centralized for consistency.
**Email System**: Resend is used for email delivery, including scheduled daily recaps, with hardcoded templates for consistency.
**CMS (Content Management System)**: A comprehensive admin panel allows for managing podcasts, episodes, people, companies, mentions, and editorial content. Features include bulk metadata enrichment, unified product management, and a support knowledge base editor.
**Entity Management**: Robust database tables for people and companies, linked to episodes via mentions detected through text-matching and AI context generation.
**API Usage Tracking**: All OpenAI API calls are logged for cost monitoring and categorization.
**Referral Program**: A "Pod Squad" referral system with tiered rewards and tracking for email-verified users.
**Pulse Product (Pro)**: FULLY REMOVED — all pulse files, routes, storage methods, UI components, and scheduler code deleted. Feature flag `pulse` seeded as OFF (harmless). Old pulse URLs redirect to home via App.tsx. DB tables (`topic_pulses`, `pulse_subscriptions`) and schema definitions retained for DB compatibility only.
**Feature Flags**: A scalable system for managing features with global toggles and per-user overrides.
**SEO/SSR Pipeline**: Asynchronous, DB-backed meta tag injection and Server-Side Rendering (SSR) for all public pages to enhance search engine visibility.
**Logged-In Feed Experience**: Features a three-column layout with an icon-only sidebar, magazine-style episode cards, and a right rail for search, referrals, and shop.
**Unified Shop**: All book and product pages unified under `/shop` with `/api/shop`, `/api/shop/books`, `/api/shop/book/:slug`, and `/api/shop/product/:slug` endpoints. Admin endpoints at `/api/admin/shop-books` and `/api/admin/shop-items`. Legacy `/bookstore` URLs have 301 redirects to `/shop` for SEO. Page component is `Shop.tsx`.
**Support Knowledge Base**: An admin-editable knowledge base powers the Help & Support AI chatbot.
**Feed Ads System**: Configurable inline feed ads (podcast and regular) integrated into the user feed, with admin controls for management.
**Error Tracking**: Global middleware logs all API errors to a dedicated table for monitoring and deduplication.
**Facebook Ad Landing Pages**: A scalable system for campaign-specific landing pages with visit tracking and analytics.
**Recap Validator** (`server/recapValidator.ts`): Unified post-creation validation that runs after every episode recap creation across all 4 code paths (emailScheduler, productionRecapScheduler, backgroundRecapGenerator, admin routes). Checks 14 fields and auto-fills gaps: tabloid headlines, Spotify URLs, Apple URLs, audio URLs, and quotes DB entries. Admin batch validation endpoint at `POST /api/admin/validate-recaps` supports `dateRange`, `limit`, and `dryRun` options.
**YouTube URL Matching Tool (Mechanical Turk)**: A worker-based review system for matching podcast episodes with YouTube video URLs. Workers access unique token-based review pages at `/youtube-review/:token` to verify auto-searched YouTube matches. Admin manages workers, generates links, and tracks per-worker stats via the "Mech. Turk" tab. Database tables: `mturk_workers`, `youtube_review_log`. Requires `YOUTUBE_API_KEY` env var for auto-search.

## Podcast Directory Upsert Safety
- **`upsertPodcastDirectoryEntry` (storage.ts)** has built-in guards:
  - **Artwork**: Never overwrites existing artwork with null/empty — uses SQL `COALESCE(new, existing)`.
  - **Name**: Never downgrades a real name to a slug-like name (e.g. "Motley Fool Money" → "motley-fool-money") — uses SQL `COALESCE(NULLIF(existing_name, slug), new_name)`.
  - These guards prevent the `ensureLandingPageDirectoryEntries()` 30s-delayed function from wiping backfill data.
- **DirectoryBackfill** (routes.ts): Runs synchronously at startup, fixes both missing artwork AND slug-style names for all directory entries via iTunes batch lookup.
- **Podcast Protection System**: Podcasts can be marked `is_protected = true` in the CMS. Protected podcasts cannot be deleted via single-delete or bulk-delete endpoints. Admin can toggle protection via the CMS bulk action bar (Shield/Unprotect buttons) or the `POST /api/admin/cms/podcasts/toggle-protection` endpoint.
- **Post-merge safety**: The `scripts/post-merge.sh` script must NEVER use `--force` flag with `drizzle-kit push` — the flag bypasses confirmation prompts and can silently drop/recreate tables, destroying all data.

## Critical Rules for Data Changes
- **Dev DB ≠ Production DB**: The development database is completely separate from production. One-time scripts that only modify the dev database will NOT affect production.
- **NEVER use one-time scripts for data fixes**: Any database data change (artwork URLs, YouTube URLs, iTunes IDs, slug corrections, etc.) MUST be written as **startup migration code** synchronously inside `registerRoutes()` in `server/routes.ts` (before the `return httpServer` line, but OUTSIDE the `setTimeout` block). This ensures the fix runs on every environment before any traffic is served.
- **Startup migration pattern**: Check if the fix is needed (e.g., `WHERE artwork_url IS NULL`), apply the fix. The fix should be idempotent — safe to run repeatedly.
- **Timing is critical**: Data backfills must run **synchronously inside `registerRoutes()`** (before the `return httpServer`), NOT inside the `setTimeout(..., 5000)` block. The server starts accepting requests as soon as `registerRoutes` returns — any backfill in the `setTimeout` block will lose the race against incoming requests that populate stale caches.
- **Task agents work on isolated environments**: Their database changes are lost after merge. Any data fix from a task agent must be accompanied by startup migration code, not just SQL scripts.
- **Always verify against production**: Use `POST /api/admin/sql` with `{"query": "SELECT ..."}` to verify data on the live production database. Never assume dev DB state matches production.

## External Dependencies
- **Stripe**: Payment processing and subscription management.
- **OpenAI**: AI models for content generation and chat.
- **Taddy GraphQL API**: Podcast transcription and show notes extraction. Budget-managed with monthly call tracking (450K/month limit), automatic rate-limit detection and backoff, and a pending transcript queue for retries. Episode discovery uses iTunes (free) instead of Taddy to reduce API usage by ~50%.
- **iTunes Search API**: Podcast search functionality and primary episode discovery (replaces Taddy for episode listing).
- **Resend**: Email delivery service.
- **`connect-pg-simple`**: PostgreSQL store for Express sessions.
- **`framer-motion`**: Frontend animation library.
- **Recharts**: For data visualization in dashboards.
- **Logo.dev**: For acquiring company logos.
- **unavatar.io**: For acquiring people's profile photos.