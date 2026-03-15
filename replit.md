# PodCap - Daily Podcast Digest

## Overview
PodCap is a full-stack web application designed to provide personalized daily podcast digest subscriptions. It allows users to manage podcast selections, receive AI-generated recaps, and access detailed episode information. The platform aims to simplify podcast discovery, deliver personalized content, and enhance user engagement, aspiring to become a leading platform for personalized podcast consumption in the audio content market.

## User Preferences
- **User Data Safety**: NEVER bulk-delete user accounts. All user accounts are real users. Only delete individual accounts via the admin panel delete button (with confirmation). The 8 core user accounts are: ss@contactsheet.org, johnsonjessicanoel@gmail.com, hiderekjohnson@gmail.com, kpfitz@gmail.com, alexdmitt@gmail.com, brissonemail@gmail.com, badonnelly84@gmail.com, ru1@mac.com

## System Architecture
**Frontend**: React, Vite, Tailwind CSS, Shadcn UI, `wouter` for routing, `framer-motion` for animations. UI adheres to WCAG AA accessibility standards, utilizing DM Sans and DM Mono fonts, an indigo/violet brand palette, and an inline SVG wordmark logo.
**Backend**: Express.js server for API and user sessions.
**Database**: PostgreSQL with Drizzle ORM and connection pooling.
**Authentication**: Session-based, secure email magic link login.
**Core Features**:
- **Pages**: Includes marketing landing, 2-step signup, user dashboards, podcast and episode recap pages, archives, and entity/category directories (Industries, Interests, Roles) with dedicated `/pulse` AI briefings.
- **AI Integration**: Uses OpenAI (GPT-4o) for a 2-pass recap generation process (full recap + key takeaways) and an episode chat panel (GPT-4o-mini). Curated `topicContexts` ensure consistency in AI-generated insights. All AI prompt logic lives in `server/recapGenerator.ts` as the single source of truth — `regenerateFullRecaps.ts` and `backgroundRecapGenerator.ts` both import and call shared functions from it.
- **Email System**: Resend handles email delivery, including scheduled daily recaps. Email templates are hardcoded for consistency.
- **Newsletter Subscriptions**: Users can subscribe to podcasts, industries, interests, and roles. A quick-subscribe endpoint facilitates account creation and subscription management.
- **Conversion System**: Utilizes `PageConversionContext` to provide contextual email CTAs (Exit Intent Popup, Inline Email CTA, Sticky Email Bar) across various page types.
- **Admin Tools**: A dashboard for user management, episode generation status, podcast expansion, data backfilling, and cache management.
- **Directory Caching**: A 24-hour in-memory cache pre-warms and manages heavy directory endpoints.
- **Trends Page**: A unified `/trends` dashboard for people, companies, and topics, featuring "Biggest Movers" and data visualizations.
- **Podcast Features**: Directory with landing pages, AI recaps, host info, enhanced show notes, and podcast-level AI Q&A. Discovery includes "Just Dropped" and "Hot Right Now."
- **Book Covers & Enrichment**: A multi-source system for book covers with a robust fallback chain. Comprehensive book enrichment fetches data from Google Books and Open Library. Admin review uses an MTurk-style single-focus review mode with keyboard shortcuts (A/→ approve, R/← reject, Z undo, 1-9 switch candidates, ? help), smart image scoring/ranking, 3-tab workflow (Needs Review sorted by popularity, No Images auto-classified, Approved with Send Back to Review), progress bar, visual flash feedback, undo support, and preloading.
- **Entity Directories**: Dedicated pages for people and companies with tab-based navigation, search, and Recharts data visualizations.
- **Asset Storage**: All images are stored locally.
- **People Image Pipeline**: Resolves profile photos from local storage, Wikipedia/Wikimedia, or X/Twitter via unavatar.io, with a placeholder fallback.
- **SEO/SSR Pipeline**: `server/podcastMeta.ts` provides async DB-backed meta tag injection and SSR HTML for all public pages, ensuring search engine visibility and using branded OG images.
- **Brand Guide**: Defines fonts (DM Sans, DM Mono, DM Serif Display), color palette (indigo/violet), and accessibility standards (WCAG AA).
- **Podcast Bookstore**: A discovery engine at `/bookstore` with curated shelves, filters, sort options, and individual book pages featuring enriched data and Blinkist CTAs. AI-generated "Why they talked about it" insights are stored and highlighted.
- **Shop Page**: Product discovery at `/shop` showcases genuinely endorsed products from podcasts, extracted via AI, with affiliate link handling and admin approval workflows.
- **Advertise Page**: Dedicated `/advertise` page detailing advertising opportunities and targeting capabilities.
- **Recap Generator Logic**: `backgroundRecapGenerator.ts` processes a default of 20 most recent episodes per podcast, distributing recaps evenly.
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