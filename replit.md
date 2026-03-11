# PodCap - Daily Podcast Digest

## Overview
PodCap is a full-stack web application providing personalized daily podcast digest subscriptions. It allows users to manage podcast selections, receive AI-generated recaps, and access detailed episode information. The project aims to deliver a seamless experience for podcast enthusiasts, simplifying discovery and recap delivery to keep users updated with their favorite shows.

## User Preferences
- **User Data Safety**: NEVER bulk-delete user accounts. All user accounts are real users. Only delete individual accounts via the admin panel delete button (with confirmation). The 8 core user accounts are: ss@contactsheet.org, johnsonjessicanoel@gmail.com, hiderekjohnson@gmail.com, kpfitz@gmail.com, alexdmitt@gmail.com, brissonemail@gmail.com, badonnelly84@gmail.com, ru1@mac.com

## Rules
- **Company Logos**: ALWAYS use Logo.dev for all company logo needs. API: `https://img.logo.dev/{domain}?token=pk_LXNkoTXrTpe8BARnvuKgHA&size=256&format=png`. The key is a publishable key (safe for client-side). Script: `server/fetchCompanyLogos.ts`. Logos stored in `client/public/logos/{slug}.png`. Free plan: 500,000 requests/month. Never use Clearbit, Google favicons, DuckDuckGo, or other logo sources.
- **People Profile Photos**: Use Wikipedia/Wikimedia Commons as primary source, Twitter/X via unavatar.io as fallback. Script: `server/fetchPeopleImages.ts`. Photos stored in `client/public/people/{slug}.png`. Placeholder threshold: <5KB. Run via CLI: `npx tsx server/fetchPeopleImages.ts`.

## System Architecture
**Frontend**: Built with React, Vite, Tailwind CSS, and Shadcn UI (trimmed to ~14 active components), using `wouter` for routing. The design uses DM Sans (all weights 300-700) for body and headings, DM Mono for monospace, an indigo (#6366F1) / violet (#8B5CF6) brand palette, and `framer-motion` for animations. The logo is an inline SVG wordmark with waveform icon — "Pod" in semibold + "Cap" in light indigo.
**Backend**: An Express.js server handles API requests and user sessions.
**Database**: PostgreSQL with Drizzle ORM is used for data storage. The connection pool (`server/db.ts`) is capped at 10 connections with 15s connection timeout and exports a `withRetry()` helper for automatic retry with exponential backoff on connection errors. The backfill script (`downloadAllTranscripts.ts`) uses its own separate 3-connection pool to avoid starving the main app.
**Authentication**: Session-based with secure email-based magic link login.
**Key Pages**: Includes a marketing-focused landing page (`/`), a 2-step signup flow (`/get-started`), user dashboards (`/dashboard`), podcast directories (`/podcasts`, `/podcasts/:slug`), SEO category pages (`/podcasts/:category` e.g. `/podcasts/business`) and topic pages (`/podcasts/:category/:topic` e.g. `/podcasts/business/entrepreneurship`), individual episode recap and transcript pages (`/podcasts/:podcastSlug/:episodeSlug`), episode archive pages (`/podcasts/:slug/episodes`) with search/filter/sort, entity directories for people and companies (`/people`, `/companies`), dynamic topic pages (`/topics`), and The Daily Drop (`/daily-drop`, `/daily-drop/:date`) — an AI-generated newsletter-style daily briefing. Each edition is a free-flowing article (like The Hustle/Morning Brew) weaving together the day's most interesting podcast conversations, quotes, and insights. Generated via `server/dailyDropGenerator.ts` and stored in `daily_drop_editions` table. Admin generates editions via "Generate Daily Drop" button or `POST /api/admin/generate-daily-drop`. Body is markdown with inline links to recap pages, rendered with XSS-safe sanitization. Podcast and episode pages utilize shared layout components (`PodcastPageLayout`, `EpisodePageLayout`). The episode archive page is a standalone utility page (no PodcastPageLayout tabs) with keyword search, guest/topic filters, sort, and URL state sync.
**Podcast Category System**: `client/src/data/podcastCategoryData.ts` defines the taxonomy — 10 categories (business, technology, finance, health, self-improvement, society-culture, news, education, psychology, science) with nested topics. `PodcastRouter.tsx` and `PodcastSubRouter.tsx` dispatch routes based on whether the slug matches a known category. Topic pages require 6+ qualifying podcasts or redirect to parent category. Cross-linking via `TOPIC_TO_TOPICS_PAGE_MAP` connects `/podcasts/[category]/[topic]` ↔ `/topics/[topic]` bidirectionally. Footer has a dynamic "Podcasts" column. Sitemap auto-generates category/topic URLs.
**AI Integration**: Leverages OpenAI (GPT-4o) via a single centralized function `generateRecapFromTranscript` in `server/recapGenerator.ts` for generating episode recaps with all fields (tldl, whatHappened, keyInsights, quote, keyTopics, topQuestions, sponsors, guests, resources). All admin routes and the email scheduler use this function — no duplicate AI prompts. Guest data is saved to DB during recap generation (no separate AI call needed on page view). AI is also used for episode/podcast-level Q&A chat features.
**Email System**: Uses Resend for email delivery, with a scheduler for generating and delivering daily recaps based on user preferences.
**Admin Tools**: Features an admin dashboard for managing users, emails, content templates, and tracking episode page generation status. It includes tools for batch expansion of podcasts and backfilling various data points like show notes, Spotify URLs, key topics, and questions.
**Podcast Features**:
- **Directory**: Manages 87 podcasts, each with landing pages, AI-generated episode recaps, and social media links.
- **Hosts**: Detailed host information is stored and displayed on podcast landing pages.
- **Episode Recaps**: Enhanced with Key Topics, Top Questions, and an "Ask About This Episode" AI-powered Q&A feature.
- **Guests Tab**: Provides AI-identified guest information, including bios, social links, and topics discussed.
- **Show Notes**: Integrates raw HTML show notes from Taddy for rich episode information.
- **Podcast-Level AI**: "Ask About This Podcast" tab offers AI-generated top questions and a free-text AI search across transcripts.
**Entity Directories**: PEOPLE_DIRECTORY (~335 people) and COMPANIES_DIRECTORY (~139 companies) in `client/src/data/entityDirectoryData.ts` power /people, /companies, and Notable Mentions matching on episode recap pages. Companies support an `associatedTerms?: string[]` field for sub-brand/product matching (e.g., OpenAI has associatedTerms ["ChatGPT", "GPT-4o", "DALL-E", "Sora"]). Associated term mentions trigger the parent company — no standalone product entries exist. Both `searchTerms` and `associatedTerms` are used for mention matching in server and client. Person pages (`/people/:slug`) are enriched SEO hubs with: H1 with search-intent keywords, Key Ideas, Notable Quotes, enriched Appearances with filter/sort/search, Podcasts Featuring Person, Associated Topics, Related People, Timeline, FAQ with schema, Person/Breadcrumb JSON-LD. Guest detection uses AI-generated `guests` JSON field only; mentions use word-boundary text matching against recap body text and episode titles.
**Local Asset Storage**: All images are stored locally in `client/public/` (~37MB total, 686 files): company logos (`/logos/{slug}.png`), people photos (`/people/{slug}.png`), podcast artwork (`/artwork/{slug}.jpg`), host photos (`/hosts/{podcast-slug}_{id}.png`). No external image dependencies.
**People Image Pipeline**: `server/fetchPeopleImages.ts` resolves profile photos for people in the directory. Priority: 1) existing local image, 2) Wikipedia/Wikimedia Commons, 3) X/Twitter via unavatar.io, 4) fallback placeholder. Run via CLI: `npx tsx server/fetchPeopleImages.ts` or via admin API: `POST /api/admin/resolve-people-images`. Placeholder threshold: <5KB. Images under 5KB are considered placeholders and will be re-resolved.
**RSS Feeds**: Public and custom RSS feeds are available for all recaps or specific content, designed for bot consumption.
**Design System**: Full WCAG AA accessibility pass applied — 18px base body text, 17px buttons/inputs/nav links, 52px minimum button/input heights, 44px minimum tap targets, 4.5:1+ contrast ratios. Text colors: body #18181B, headings #09090B, muted #3F3F46, placeholder #71717A. All shadcn components (button, card, input, select, textarea, label, tooltip, dialog, tabs, toast) updated for accessibility. Navbar height 68px min, logo 36px, avatars 72px mobile / 96px desktop. All pages SEO-optimized with dynamic meta tags, OG tags, canonical URLs, and JSON-LD schema. Typography uses DM Sans for all text.

## Apple Podcast Ratings
**Table columns**: `apple_rating` (text, e.g. "4.8") and `apple_rating_count` (integer, e.g. 27184) on `podcast_directory`.
**Data source**: Scraped from Apple Podcasts web pages (structured data `ratingValue` and `reviewCount` fields). 243 of 244 podcasts have ratings populated.
**Backfill**: `POST /api/admin/backfill-apple-ratings` (admin auth required) scrapes all podcasts with iTunes IDs. Rate-limited with 1s delay per 5 podcasts.
**Display**: Hero section (PodcastPageLayout) shows filled star icon + rating + formatted count. Podcast Snapshot stat cards (PodcastLandingGeneric) show "Apple Rating" card. Count formatted as K for 1000+.

## External Dependencies
- **Stripe**: For payment processing and subscription management.
- **OpenAI**: For AI-driven podcast recap generation and content extraction.
- **Taddy GraphQL API**: For podcast transcription services and show notes.
- **iTunes Search API**: For podcast search functionality.
- **Resend**: For email delivery.
- **`connect-pg-simple`**: For PostgreSQL-backed Express session storage.
- **`framer-motion`**: For frontend animations.

## Podcast Bookstore
**Route**: `/podcasts/bookstore` — aggregates all books mentioned across all podcast episode recaps.
**API**: `GET /api/bookstore` returns `{ books: [...], total: number }`. Books are ranked by mention count (how many times discussed across episodes) and podcast count (how many different shows mention them).
**Data source**: Book resources extracted from `landing_page_recaps.resources` JSON during AI recap generation. No separate scraping needed.
**Features**: Search by title/author, sort (Most Mentioned, Most Podcasts, A-Z), expandable episode lists per book, Amazon affiliate links (tag: `podcap-20`).
**Book Covers**: Amazon image via ASIN (primary), Open Library API fallback (search by title → cover_i ID).
**Affiliate Disclosure**: Shown at bottom of page per FTC guidelines.

## Episode Recap Page Sections (in order)
About this Episode (SEO intro paragraph), Key Takeaways, Notable Quotes (violet-500, quote cards with share bars and Make Image modal), Full Recap, Guests (sky-500), Notable Mentions (orange-500, matches PEOPLE_DIRECTORY/COMPANIES_DIRECTORY, links to /people and /companies), Key Topics (emerald-500, chips link to /topics/{slug}), Books Mentioned (amber-500, Amazon affiliate links with tag podcap-20), Sponsors (teal-500, coupon codes with copy button), Hosts (indigo-500, from /api/podcasts/:slug/hosts), Questions Answered in This Episode (violet-500, expanded H3s), Podcast Chat (violet-500, AI sparkle badge). Navigation chips at top scroll to each section. Podcaster Byline banner appears above content when podcast has a verified claim with byline text.

## Episode Quotes System
**Table**: `episode_quotes` stores extracted quotes with speakerName, speakerRole, quoteText, context, quoteType (Hero Quote, Hot Take, Prediction, Spicy, Tweetable), sortOrder.
**Extraction**: `extractQuotesFromTranscript()` in `server/recapGenerator.ts` uses GPT-4o to extract 3-5 editorial quotes per episode. Prefers guest quotes over host. Requires at least one Hero Quote and one Hot Take/Prediction.
**API**: `GET /api/podcasts/:slug/:episodeSlug/quotes` fetches, `POST /api/podcasts/:slug/:episodeSlug/quotes/generate` extracts (admin auth required).
**UI**: Quote cards with type badges, share bars (X, Threads, Bluesky, LinkedIn, Facebook, Instagram copy-to-clipboard), and Make Image modal (canvas-based, square 1:1 or story 9:16 format).

## Podcaster System
**Podcaster Claims**: `podcaster_claims` table stores podcast ownership claims. Podcasters claim their show at `/podcaster/claim`, admin verifies via `/api/admin/podcaster-claims/:id/verify`. Verified claims unlock the dashboard.
**Podcaster Dashboard**: `/podcaster/dashboard/:slug` — manages custom byline (text, URL, label) and views detected sponsors. Auth via magic link email + session (`podcasterEmail` on session).
**Custom Byline**: Verified podcasters set a message + optional link that appears on every podcast page and episode recap page via `PodcasterByline` component. Fetched from `GET /api/podcaster/claim/:slug` (public, cached 1hr).
**Sponsor Display**: Sponsors extracted by AI during recap generation are displayed on episode recap pages in a dedicated "Sponsors" section with name, description, coupon code (copy button), URL, and how-to-redeem.
**For Podcasters Page**: `/we-heart-podcasters` — marketing page with sponsor amplification value prop, custom byline section, and claim CTA.
**API Routes**: `POST /api/podcaster/claim`, `GET /api/podcaster/claim/:slug` (public byline), `POST /api/podcaster/login`, `GET /api/podcaster/verify`, `GET/PUT /api/podcaster/dashboard/:slug`, `GET /api/admin/podcaster-claims`, `PUT /api/admin/podcaster-claims/:id/verify`.