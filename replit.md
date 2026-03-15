# PodCap - Daily Podcast Digest

## Overview
PodCap is a full-stack web application designed to provide personalized daily podcast digest subscriptions. It allows users to manage podcast selections, receive AI-generated recaps, and access detailed episode information. The platform aims to simplify podcast discovery, deliver personalized content, and enhance user engagement, aspiring to become a leading platform for personalized podcast consumption in the audio content market.

## User Preferences
- **User Data Safety**: NEVER bulk-delete user accounts. All user accounts are real users. Only delete individual accounts via the admin panel delete button (with confirmation). The 8 core user accounts are: ss@contactsheet.org, johnsonjessicanoel@gmail.com, hiderekjohnson@gmail.com, kpfitz@gmail.com, alexdmitt@gmail.com, brissonemail@gmail.com, badonnelly84@gmail.com, ru1@mac.com

## System Architecture
**Frontend**: React, Vite, Tailwind CSS, Shadcn UI, `wouter` for routing, `framer-motion` for animations. UI adheres to WCAG AA accessibility standards, utilizing DM Sans and DM Mono fonts, an indigo/violet brand palette, and an inline SVG wordmark logo.
**Backend**: Express.js server for API and user sessions.
**Database**: PostgreSQL with Drizzle ORM and connection pooling.
**Authentication**: Session-based with email magic link login and Google OAuth (one-click sign-in). Google OAuth stores `google_id` on users table with unique constraint. New Google users are auto-verified and tracked as `google_oauth` signup source.
**Core Features**:
- **Pages**: Includes marketing landing, 2-step signup, user dashboards, podcast and episode recap pages, archives, and entity/category directories (Industries, Interests, Roles) with dedicated `/pulse` AI briefings.
- **AI Integration**: Uses OpenAI (GPT-4o) for a 2-pass recap generation process (full recap + key takeaways) and an episode chat panel (GPT-4o-mini). Curated `topicContexts` ensure consistency in AI-generated insights. All AI prompt logic lives in `server/recapGenerator.ts` as the single source of truth — `regenerateFullRecaps.ts` and `backgroundRecapGenerator.ts` both import and call shared functions from it.
- **Email System**: Resend handles email delivery, including scheduled daily recaps. Email templates are hardcoded for consistency.
- **Newsletter Subscriptions**: Users can subscribe to podcasts, industries, interests, and roles. A quick-subscribe endpoint facilitates account creation and subscription management.
- **Conversion System**: Utilizes `PageConversionContext` to provide contextual email CTAs (Exit Intent Popup, Inline Email CTA, Sticky Email Bar) across various page types.
- **Admin Tools**: A dashboard for user management, episode generation status, podcast expansion, data backfilling, and cache management. Includes a comprehensive analytics hub with four sub-dashboards: User Acquisition, Affiliate Performance, User Growth, and Email Marketing — each with time-range filtering and granularity controls. An "API Costs" tab tracks OpenAI API usage with daily/weekly/monthly spend summaries, a Recharts daily bar chart, budget progress bar, feature breakdown, model breakdown, and recap-specific metrics. A "Shop" tab provides unified shop management with two sub-tabs: "Approval Queue" (card-based review of pending products one at a time, with image browsing/search/upload, approve/reject buttons, skip, and navigation) and "Approved" (searchable list of approved products with inline editing). All product types (books, physical products, services, experiences) are treated uniformly as "products" — no separate book vs product distinction. APIs: `GET /api/admin/shop/queue`, `GET /api/admin/shop/approved`, `POST /api/admin/shop/:sourceType/:id/approve|reject|update`, `GET /api/admin/shop/:sourceType/:id/find-images`. An "Admins" tab manages admin users (`admin_users` table) with full CRUD, invite flow via Resend email, and account setup page at `/admin/setup`.
- **API Usage Tracking**: Every OpenAI API call is logged to the `api_usage_logs` DB table via `server/apiUsageTracker.ts`, capturing model, token counts, estimated cost, and feature category. The tracker is fire-and-forget (never throws) to avoid disrupting existing flows.
- **Signup Tracking**: New users have their signup source, source detail, IP address, user-agent, and device type captured silently on registration and quick-subscribe.
- **Affiliate Click Tracking**: A redirect endpoint (`/api/track/affiliate-click`) logs web-based clicks on affiliate/product links to the `affiliate_clicks` table.
- **Directory Caching**: A 24-hour in-memory cache pre-warms and manages heavy directory endpoints.
- **Trends Page**: A unified `/trends` dashboard for people, companies, and topics, featuring "Biggest Movers" and data visualizations.
- **Podcast Features**: Directory with landing pages, AI recaps, host info, enhanced show notes, and podcast-level AI Q&A. Discovery includes "Just Dropped" and "Hot Right Now."
- **Book Covers & Enrichment**: A multi-source system for book covers with a robust fallback chain. Comprehensive book enrichment fetches data from Google Books and Open Library. Admin review uses an MTurk-style single-focus review mode with keyboard shortcuts (A/→ approve, R/← reject, Z undo, 1-9 switch candidates, ? help), smart image scoring/ranking, 3-tab workflow (Needs Review sorted by popularity, No Images auto-classified, Approved with Send Back to Review), progress bar, visual flash feedback, undo support, and preloading.
- **Entity Directories**: Dedicated pages for people and companies with tab-based navigation, search, and Recharts data visualizations.
- **Asset Storage**: All images are stored locally.
- **People Image Pipeline**: Resolves profile photos from local storage, Wikipedia/Wikimedia, or X/Twitter via unavatar.io, with a placeholder fallback.
- **SEO/SSR Pipeline**: `server/podcastMeta.ts` provides async DB-backed meta tag injection and SSR HTML for all public pages, ensuring search engine visibility and using branded OG images.
- **Brand Guide**: Defines fonts (DM Sans, DM Mono, DM Serif Display), color palette (indigo/violet), and accessibility standards (WCAG AA).
- **Unified Shop**: Merged bookstore and product pages into a single `/shop` page. Books, tools, and products share one card grid with category filters (Books, Tools, Physical Products, Experiences), podcast filter, topic filter, and search. Individual book pages at `/shop/:slug` and individual product detail pages at `/shop/:slug` (same URL pattern, routed via ShopDetailRouter that tries book first, then product). ProductDetailPage shows product image, description, podcast contexts (with AI-summarized editorial text when available), episode mentions with AI-summarized "Why they talked about it" context, related products, PodcastMicBadge, and affiliate disclosure. PodcastMicBadge shows unique podcast recommendation count instead of star ratings. Affiliate disclosure on shop, book detail, product detail, and episode recap pages. Legacy `/bookstore` URLs 301-redirect to `/shop`. SSR metadata and sitemap emit `/shop/` paths for both books and products.
- **Product Image Approval**: Products have an `image_status` column (pending/approved/rejected). Only products with `image_status = 'approved'` appear on public-facing pages (shop shelves, podcast landing pages, episode recaps, sitemap). Admin panel includes an Image Approval section where admins can approve, replace, or reject product images. Products without approved images are hidden from the shop until fixed.
- **Context Summarization**: Products have a `context_summary` column. An admin "AI Summarize Contexts" button generates polished editorial summaries from raw transcript contexts using GPT-4o-mini. The ProductDetailPage prefers `contextSummaries` over raw `contexts` for the "What top podcasters are saying" section, and prefers `contextSummary` over raw `context` for per-episode "Why they talked about it" sections.
- **Advertise Page**: Dedicated `/advertise` page detailing advertising opportunities and targeting capabilities.
- **Recap Generator Logic**: `backgroundRecapGenerator.ts` processes a default of 20 most recent episodes per podcast, distributing recaps evenly.
- **Daily Pulse Scheduler**: `server/dailyPulseScheduler.ts` runs automatically on server startup. Every day at ~7:00 AM UTC, it generates topic pulses for yesterday's episodes across all 37 topics. The scheduler uses `setInterval` (hourly checks) and tracks `lastRunDate` to avoid duplicates. Manual batch generation is available via `server/generateAllPulses.ts` with `--dates=YYYY-MM-DD,YYYY-MM-DD` flag.
- **Product Filtering**: `isLikelySponsorProduct` function filters out known sponsors, products with sponsor keywords, affiliate tracking URLs, and generic non-brand products.
- **Taddy Webhook Product Extraction**: Automatically saves and filters products from new episodes arriving via Taddy webhooks.

## External Dependencies
- **Stripe**: Payment processing and subscription management.
- **OpenAI**: AI-driven content generation and chat.
- **Taddy GraphQL API**: Podcast transcription services and show notes.
- **iTunes Search API**: Podcast search functionality.
- **Resend**: Email delivery.
- **`connect-pg-simple`**: PostgreSQL-backed Express session storage.
- **`framer-motion`**: Frontend animations.
- **Recharts**: Data visualization charts.
- **Logo.dev**: Company logo acquisition.
- **unavatar.io**: People profile photo acquisition.