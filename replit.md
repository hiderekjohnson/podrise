# PodCap - Daily Podcast Digest

## Overview
PodCap is a full-stack web application providing personalized daily podcast digest subscriptions. It allows users to manage podcast selections, receive AI-generated recaps, and access detailed episode information. The project aims to deliver a seamless experience for podcast enthusiasts, simplifying discovery and recap delivery to keep users updated with their favorite shows.

## User Preferences
- **User Data Safety**: NEVER bulk-delete user accounts. All user accounts are real users. Only delete individual accounts via the admin panel delete button (with confirmation). The 8 core user accounts are: ss@contactsheet.org, johnsonjessicanoel@gmail.com, hiderekjohnson@gmail.com, kpfitz@gmail.com, alexdmitt@gmail.com, brissonemail@gmail.com, badonnelly84@gmail.com, ru1@mac.com

## System Architecture
**Frontend**: Built with React, Vite, Tailwind CSS, and Shadcn UI (trimmed to ~14 active components), using `wouter` for routing. The design uses DM Sans (all weights 300-700) for body and headings, DM Mono for monospace, an indigo (#6366F1) / violet (#8B5CF6) brand palette, and `framer-motion` for animations. The logo is an inline SVG wordmark with waveform icon — "Pod" in semibold + "Cap" in light indigo.
**Backend**: An Express.js server handles API requests and user sessions.
**Database**: PostgreSQL with Drizzle ORM is used for data storage. The connection pool (`server/db.ts`) is capped at 10 connections with 15s connection timeout and exports a `withRetry()` helper for automatic retry with exponential backoff on connection errors. The backfill script (`downloadAllTranscripts.ts`) uses its own separate 3-connection pool to avoid starving the main app.
**Authentication**: Session-based with secure email-based magic link login.
**Key Pages**: Includes a marketing-focused landing page (`/`), a 2-step signup flow (`/get-started`), user dashboards (`/dashboard`), podcast directories (`/podcasts`, `/podcasts/:slug`), individual episode recap and transcript pages (`/podcasts/:podcastSlug/:episodeSlug`), entity directories for people and companies (`/people`, `/companies`), and dynamic topic pages (`/topics`). All podcast and episode pages utilize shared layout components (`PodcastPageLayout`, `EpisodePageLayout`) for consistency.
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

## External Dependencies
- **Stripe**: For payment processing and subscription management.
- **OpenAI**: For AI-driven podcast recap generation and content extraction.
- **Taddy GraphQL API**: For podcast transcription services and show notes.
- **iTunes Search API**: For podcast search functionality.
- **Resend**: For email delivery.
- **`connect-pg-simple`**: For PostgreSQL-backed Express session storage.
- **`framer-motion`**: For frontend animations.

## Episode Recap Page Sections (in order)
About this Episode (SEO intro paragraph), Key Takeaways, Full Recap, Guests (sky-500), Notable Mentions (orange-500, matches PEOPLE_DIRECTORY/COMPANIES_DIRECTORY, links to /people and /companies), Key Topics (emerald-500, chips link to /topics/{slug}), Hosts (indigo-500, from /api/podcasts/:slug/hosts), Questions Answered in This Episode (violet-500, expanded H3s), Podcast Chat (violet-500, AI sparkle badge). Navigation chips at top scroll to each section.