# PodCap - Daily Podcast Digest

## Overview
PodCap is a full-stack web application designed to provide personalized daily podcast digest subscriptions. It enables users to manage their podcast selections, receive AI-generated recaps, and access detailed episode information. The primary goal is to simplify podcast discovery and recap delivery for enthusiasts, ensuring they stay updated with their favorite shows efficiently. The project aims to become the go-to platform for personalized podcast content, enhancing user engagement and accessibility to spoken-word audio.

## User Preferences
- **User Data Safety**: NEVER bulk-delete user accounts. All user accounts are real users. Only delete individual accounts via the admin panel delete button (with confirmation). The 8 core user accounts are: ss@contactsheet.org, johnsonjessicanoel@gmail.com, hiderekjohnson@gmail.com, kpfitz@gmail.com, alexdmitt@gmail.com, brissonemail@gmail.com, badonnelly84@gmail.com, ru1@mac.com

## System Architecture
**Frontend**: Built with React, Vite, Tailwind CSS, and Shadcn UI, utilizing `wouter` for routing. The UI features DM Sans and DM Mono fonts, an indigo/violet brand palette, and `framer-motion` for animations. The logo is an inline SVG wordmark.
**Backend**: An Express.js server manages API requests and user sessions.
**Database**: PostgreSQL with Drizzle ORM provides data storage, featuring a connection pool with retry mechanisms.
**Authentication**: Session-based, employing secure email-based magic link login.
**Key Pages**: Includes a marketing landing page, a 2-step signup flow, user dashboards, individual podcast landing pages, individual episode recap pages, episode archives, entity directories for people and companies, Insights pages (formerly Topics - route: /insights, /insights/:slug), and "Signal" - an AI-generated newsletter-style daily briefing (routes still use /daily-drop paths, DB table is daily_drop_editions). Note: Public transcript pages have been removed for copyright compliance. Backend transcript data/logic is retained for internal use only. The /podcasts directory page and category pages have been removed as part of the pivot to an insights-first platform. Old /topics/* URLs 301-redirect to /insights/*.
**Insights System**: Formerly called "Topics", now at /insights. Features a Google Trends-inspired UI with trending topics section (mini trend lines), prominent search bar, KPI cards on detail pages (Status, Sources, Episodes, Latest). Topic data defined in `client/src/data/topicData.ts`.
**AI Integration**: OpenAI (GPT-4o) generates episode recaps, including key insights, quotes, topics, and Q&A features. It also identifies guest data.
**Email System**: Resend handles email delivery, including a scheduler for daily recap subscriptions.
**Admin Tools**: An admin dashboard facilitates user management, content templating, and episode page generation status tracking, along with tools for podcast expansion and data backfilling.
**Podcast Features**: Manages a directory of podcasts with landing pages, AI-generated recaps, host information, enhanced show notes from Taddy, and podcast-level AI Q&A.
**Entity Directories**: `PEOPLE_DIRECTORY` and `COMPANIES_DIRECTORY` power dedicated pages and enable "Notable Mentions" matching in recaps. Company entries include `associatedTerms` for sub-brand matching.
**Local Asset Storage**: All images (company logos, people photos, podcast artwork, host photos) are stored locally.
**People Image Pipeline**: A system resolves profile photos for directory entries, prioritizing existing local images, then Wikipedia/Wikimedia Commons, then X/Twitter via unavatar.io, with a fallback placeholder.
**RSS Feeds**: Public and custom RSS feeds are available for content consumption.
**Design System**: Adheres to WCAG AA accessibility standards, with specific typography, color contrasts, and component sizing. All pages are SEO-optimized with dynamic meta tags and JSON-LD schema.
**Apple Podcast Ratings**: Integrates and displays scraped Apple Podcast ratings on relevant podcast pages.
**Podcast Bookstore**: Full discovery engine at `/bookstore` with curated shelves (Trending, Highest Rated, Quick Reads, Recently Published), topic filter chips (12 categories from episode key_topics), length filters (Short/Medium/Long by page count), and 6 sort options. Individual book pages at `/bookstore/:bookSlug` feature: Podcast Score (proprietary metric based on mentions/diversity/repeat recs), enriched hero (rating, page count, publish year, topics, first/last mentioned dates), featured pull quote, notable hosts with repeat mention counts, episodes grouped by podcast with expand/collapse, "Frequently Mentioned Alongside" related books with co-mention counts, dual CTAs (Amazon + Audible), share buttons (X + copy link), mobile sticky buy button, and Book schema markup. Book metadata enriched from Open Library API (page count, publish year, ratings) and episode key_topics. Amazon affiliate tag: `podcap-20`.
**Episode Recap Page Sections**: Structured content flow including SEO intro, Key Takeaways, Notable Quotes, Full Recap, Guests, Notable Mentions, Key Topics, Books Mentioned, Sponsors, Hosts, and Questions Answered.
**Episode Quotes System**: Extracts 3-5 editorial quotes per episode using GPT-4o, storing them with speaker details and quote type. Quotes are displayed in shareable cards.
**Podcaster System**: Allows podcasters to claim their shows, manage custom bylines, and view detected sponsors through a dedicated dashboard, secured via magic link email authentication.

## External Dependencies
- **Stripe**: Payment processing and subscription management.
- **OpenAI**: AI-driven podcast recap generation and content extraction.
- **Taddy GraphQL API**: Podcast transcription services and show notes.
- **iTunes Search API**: Podcast search functionality.
- **Resend**: Email delivery.
- **`connect-pg-simple`**: PostgreSQL-backed Express session storage.
- **`framer-motion`**: Frontend animations.
- **Logo.dev**: Company logo acquisition.
- **unavatar.io**: People profile photo acquisition (Twitter/X fallback).