# PodCap - Daily Podcast Digest

## Overview
PodCap is a full-stack web application providing personalized daily podcast digest subscriptions. It enables users to manage podcast selections, receive AI-generated recaps, and access detailed episode information. The platform aims to simplify podcast discovery, deliver personalized content, and enhance user engagement by offering an efficient way to stay updated with favorite shows. The business vision is to become the leading platform for personalized podcast consumption, offering significant market potential in the audio content space.

## User Preferences
- **User Data Safety**: NEVER bulk-delete user accounts. All user accounts are real users. Only delete individual accounts via the admin panel delete button (with confirmation). The 8 core user accounts are: ss@contactsheet.org, johnsonjessicanoel@gmail.com, hiderekjohnson@gmail.com, kpfitz@gmail.com, alexdmitt@gmail.com, brissonemail@gmail.com, badonnelly84@gmail.com, ru1@mac.com

## System Architecture
**Frontend**: React, Vite, Tailwind CSS, Shadcn UI, `wouter` for routing, `framer-motion` for animations. UI uses DM Sans and DM Mono fonts, an indigo/violet brand palette, and an inline SVG wordmark logo. WCAG AA accessibility standards are followed.
**Backend**: Express.js server for API and user sessions.
**Database**: PostgreSQL with Drizzle ORM and connection pooling.
**Authentication**: Session-based, secure email magic link login.
**Core Features**:
- **Pages**: Marketing landing, 2-step signup, user dashboards, podcast landing pages, episode recap pages, episode archives, entity directories (people, companies), category directories (`/industries`, `/interests`, `/roles`), topic detail pages (`/industries/:slug`, `/interests/:slug`, `/roles/:slug`). Legacy `/topics` and `/insights` routes maintained for backwards compatibility. The "Signal" daily briefing (`/daily-drop`) was removed.
- **Topics/Category System**: Topics split into three categories: Industries, Interests (Topics), and Roles. Each has its own listing page and URL namespace. Topic data in `client/src/data/topicData.ts` has `TopicCategory` type (`"industry" | "interest" | "role"`), with exports `INDUSTRIES`, `INTERESTS`, `ROLES`, `getCategoryPath()`, and `getTopicBySlug()`. Header has an "Explore" dropdown with 3 columns showing top items from each category.
- **The Pulse (Topic Intelligence Briefings)**: Daily AI-synthesized briefings per topic at `/:category/:slug/pulse`. Generation uses `server/pulseGenerator.ts` with OpenAI and `topicKeywordsMap` for episode matching. Tone is "smart friend." Features breadcrumb navigation, linked podcast names, canonical URLs, and JSON-LD Article schema.
- **AI Integration**: OpenAI (GPT-4o) generates two-pass recaps (narrative + structured data, then key takeaways). Episode chat panel (GPT-4o-mini) with rate limiting and "Deep dive" triggers. Recap generation uses curated `topicContexts` for consistency with the insights system.
- **Email System**: Resend for email delivery, including scheduled daily recaps.
- **Newsletter Subscriptions**: Users can subscribe to industries, interests, and roles (in addition to podcasts). `users` table has `industries`, `interests`, `roles` text array columns and `topicFrequencies` jsonb. Quick-subscribe endpoint at `POST /api/subscriptions/quick-subscribe` creates accounts or adds subscriptions. Dashboard has a "Topics" tab for managing topic subscriptions. `NewsletterSignup` component (`client/src/components/NewsletterSignup.tsx`) supports `card`, `inline`, and `banner` variants.
- **Conversion System**: `PageConversionContext` (`client/src/contexts/PageConversionContext.tsx`) provides page-specific context for email CTAs. Pages call `useSetConversion()` to register their type, name, slug, artwork, hosts, etc. Three conversion components: `ExitIntentPopup` (contextual exit-intent modal with podcast artwork/host names), `InlineEmailCTA` (card/gradient/minimal variants), `StickyEmailBar` (sticky bottom bar). Topic pages have gradient CTA after insights + card CTA near footer + sticky bar. Category pages have gradient CTA between topics + sticky bar. Podcast/episode pages use their own built-in CTAs plus the exit intent popup.
- **Admin Tools**: Dashboard for user management, episode generation status, podcast expansion, and data backfilling, with cache management endpoints. Email template editing was removed; the daily recap email design is hardcoded in `server/emailTemplate.ts`. `markdownToEmailHtml()` accepts optional `episodeMeta` map (keyed by derived slug) and `emailCopy` object ({ previewText, leadHeadline, supportingDetail, coverlines }). Email structure: logo bar, kicker ("In your podcasts yesterday \u2014"), AI-generated lead headline (24px bold), supporting detail (16px muted), coverlines for remaining episodes, hairline divider, episode pills, episode cards, sign-off ("We listened so you didn't have to."), branded footer. `generateEmailSubjectAndPreview()` in emailScheduler.ts generates subject, preheader, leadHeadline, supportingDetail, and coverlines as one unified AI system. Kicker and sign-off are static, never AI-generated.
- **Directory Caching**: 24-hour in-memory cache for heavy directory endpoints (`/api/entities/people`, `/api/entities/companies`, `/api/entities/topics`, `/api/bookstore`, `/api/podcasts-discovery`, `/api/podcasts/directory`), pre-warmed on startup and invalidated on new recap generation.
- **Trends Page**: Unified dashboard at `/trends` for people, companies, and topics with "Biggest Movers," filterable/sortable table, and navigation cards.
- **Podcast Features**: Directory with landing pages, AI recaps, host info, enhanced show notes, and podcast-level AI Q&A. Discovery experience with "Just Dropped" and "Hot Right Now." Individual podcast pages have sticky navigation (Episode Recaps, Discover, Recommended Reading, About).
- **Book Covers**: Local storage with fallback to Google Books API via `google_books_id`, then a placeholder.
- **Entity Directories**: `PEOPLE_DIRECTORY` and `COMPANIES_DIRECTORY` power dedicated pages and "Notable Mentions" in recaps. Pages feature tab-based navigation, persistent search, and Recharts data visualizations.
- **Asset Storage**: All images (logos, photos, artwork) are stored locally.
- **People Image Pipeline**: Resolves profile photos prioritizing local images, then Wikipedia/Wikimedia Commons, then X/Twitter via unavatar.io, with a fallback placeholder.
- **RSS Feeds**: Public and custom RSS feeds.
- **SEO/SSR Pipeline**: `server/podcastMeta.ts` provides async DB-backed meta tag injection and SSR HTML for all public pages, ensuring content is visible to search engines. JSON-LD and all DB-derived content are sanitized/escaped.
- **Style Guide**: Strict typography, color contrast, and sizing rules for readability on public-facing pages.
- **Apple Podcast Ratings**: Integration and display of scraped Apple Podcast ratings.
- **Podcast Bookstore**: Discovery engine at `/bookstore` with curated shelves, topic/length filters, and sort options. Individual book pages at `/bookstore/:bookSlug` feature Podcast Score, enriched hero, featured quotes, notable hosts, related books, and Blinkist CTAs. Book links point to Blinkist summaries.
- **Episode Recap Page Structure**: SEO intro, Key Takeaways, Episode Recap, Participants, Notable Mentions, Books Mentioned, Quotes. Guest block in header. Invisible JSON-LD FAQ schema for Q&A.
- **Episode Quotes System**: Extracts 3-5 editorial quotes per episode with speaker details and quote type for shareable cards.
- **Recap Post-Processing**: `postProcessRecap()` handles transcript segment parsing, quote extraction, and book enrichment after every recap generation/update.
- **Podcaster System**: Allows podcasters to claim shows, manage bylines, and view detected sponsors via a dedicated dashboard with magic link authentication.

## External Dependencies
- **Stripe**: Payment processing and subscription management.
- **OpenAI**: AI-driven recap generation, content extraction, and chat.
- **Taddy GraphQL API**: Podcast transcription services and show notes. Transcripts are critical and accessed for every episode.
- **iTunes Search API**: Podcast search functionality.
- **Resend**: Email delivery.
- **`connect-pg-simple`**: PostgreSQL-backed Express session storage.
- **`framer-motion`**: Frontend animations.
- **Recharts**: Data visualization charts.
- **Logo.dev**: Company logo acquisition.
- **unavatar.io**: People profile photo acquisition.