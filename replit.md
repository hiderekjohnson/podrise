# PodCap - Daily Podcast Digest

## Overview
PodCap is a full-stack web application providing personalized daily podcast digest subscriptions. It allows users to manage podcast selections, receive AI-generated recaps, and access detailed episode information. The platform aims to simplify podcast discovery, deliver personalized content, and enhance user engagement, aspiring to become a leading platform for personalized podcast consumption in the audio content market.

## User Preferences
- **User Data Safety**: NEVER bulk-delete user accounts. All user accounts are real users. Only delete individual accounts via the admin panel delete button (with confirmation). The 8 core user accounts are: ss@contactsheet.org, johnsonjessicanoel@gmail.com, hiderekjohnson@gmail.com, kpfitz@gmail.com, alexdmitt@gmail.com, brissonemail@gmail.com, badonnelly84@gmail.com, ru1@mac.com

## System Architecture
**Frontend**: React, Vite, Tailwind CSS, Shadcn UI, `wouter` for routing, `framer-motion` for animations. UI adheres to WCAG AA accessibility standards, utilizing DM Sans and DM Mono fonts, an indigo/violet brand palette, and an inline SVG wordmark logo.
**Backend**: Express.js server for API and user sessions.
**Database**: PostgreSQL with Drizzle ORM and connection pooling.
**Authentication**: Dual session + JWT token auth supporting email magic link and Google OAuth for web, and JWT Bearer tokens for mobile.
**Mobile API**: Dedicated endpoints for iOS companion app, including registration, login, token management, and push notifications via APNs.
**Onboarding Flow**: A 2-step onboarding process (podcast suggestions, topic interests) for new users after email verification.
**Core Features**:
- **Pages**: Includes marketing landing, signup, user dashboards, podcast and episode recaps, archives, and entity/category directories with `/pulse` AI briefings.
- **AI Integration**: Utilizes OpenAI (GPT-4o, GPT-4o-mini) for 2-pass recap generation, key takeaways, and episode chat. AI prompt logic is centralized in `server/recapGenerator.ts`.
- **Email System**: Resend for email delivery, including scheduled daily recaps.
- **Podcast Lists**: Curated podcast lists by category, managed via admin panel.
- **Newsletter Subscriptions**: Users can subscribe to podcasts, industries, interests, and roles.
- **Conversion System**: Contextual email CTAs (Exit Intent Popup, Inline Email CTA, Sticky Email Bar) for lead generation.
- **Admin Tools**: Dashboard for user management, episode generation status, podcast expansion, data backfilling, cache management, analytics (User Acquisition, Affiliate Performance, User Growth, Email Marketing), OpenAI API cost tracking, unified shop management (Approval Queue, Approved items), and admin user management.
- **API Usage Tracking**: Logs all OpenAI API calls to `api_usage_logs` table for cost tracking.
- **Signup Tracking**: Captures signup source, IP, user-agent, and device type for new registrations.
- **Affiliate Click Tracking**: Logs web-based affiliate/product link clicks.
- **Directory Caching**: 24-hour in-memory cache for heavy directory endpoints.
- **Trends Page**: Unified `/trends` dashboard with "Biggest Movers" and data visualizations.
- **Podcast Features**: Directory with landing pages, AI recaps, host info, enhanced show notes, podcast-level AI Q&A, "Just Dropped" and "Hot Right Now" discovery.
- **Book Covers & Enrichment**: Multi-source system for book covers with fallback, Google Books and Open Library enrichment. Admin review interface for book covers with MTurk-style workflow.
- **Entity Directories**: Dedicated pages for people and companies with search and data visualizations.
- **Asset Storage**: All images stored locally.
- **People Image Pipeline**: Resolves profile photos from local storage, Wikipedia/Wikimedia, or X/Twitter via unavatar.io.
- **SEO/SSR Pipeline**: Async DB-backed meta tag injection and SSR for all public pages for search engine visibility.
- **Logged-In Desktop Experience**: Three-column layout on large screens, collapsible left sidebar, mobile bottom navigation, light/dark mode, profile settings, bookmarks, hover preview cards, and redesigned Discover page.
- **Unified Shop**: Merged bookstore and product pages into a single `/shop` page with unified filtering and detail pages (`/shop/:slug`) that normalize book and product data.
- **Product Image Approval**: Products require `image_status = 'approved'` to be visible publicly; managed via admin panel.
- **Context Summarization**: Generates polished editorial summaries for products using AI, preferring these over raw contexts.
- **Advertise Page**: Dedicated page detailing advertising opportunities.
- **Recap Generator Logic**: Processes recent episodes for recap generation, distributing recaps evenly.
- **Daily Pulse Scheduler**: Generates daily topic pulses for yesterday's episodes, running automatically.
- **Product Filtering**: Filters out known sponsor products and non-brand items.
- **Taddy Webhook Product Extraction**: Automatically extracts and filters products from new episodes.
- **Pod Squad Referral Program**: Morning Brew-style referral system with tiered rewards, tracking, and sharing options.
- **Pulse Product (Pro)**: Paid subscription for personalized daily topic briefings ($15/mo or $150/yr), with topic selection UI and Stripe integration.

## External Dependencies
- **Stripe**: Payment processing and subscription management for Pulse Pro.
- **OpenAI**: AI-driven content generation and chat.
- **Taddy GraphQL API**: Podcast transcription and show notes.
- **iTunes Search API**: Podcast search functionality.
- **Resend**: Email delivery.
- **`connect-pg-simple`**: PostgreSQL-backed Express session storage.
- **`framer-motion`**: Frontend animations.
- **Recharts**: Data visualization charts.
- **Logo.dev**: Company logo acquisition.
- **unavatar.io**: People profile photo acquisition.