# PodCap - Daily Podcast Digest

## Overview
PodCap is a full-stack web application providing personalized daily podcast digest subscriptions. It allows users to manage podcast selections, receive AI-generated recaps, and access detailed episode information. The project aims to deliver a seamless experience for podcast enthusiasts, simplifying discovery and recap delivery to keep users updated with their favorite shows.

## User Preferences
- **User Data Safety**: NEVER bulk-delete user accounts. All user accounts are real users. Only delete individual accounts via the admin panel delete button (with confirmation). The 8 core user accounts are: ss@contactsheet.org, johnsonjessicanoel@gmail.com, hiderekjohnson@gmail.com, kpfitz@gmail.com, alexdmitt@gmail.com, brissonemail@gmail.com, badonnelly84@gmail.com, ru1@mac.com

## System Architecture
**Frontend**: Built with React, Vite, Tailwind CSS, and Shadcn UI, using `wouter` for routing. The design features clean white cards with subtle borders, Plus Jakarta Sans for display fonts, and `framer-motion` for animations.
**Backend**: An Express.js server handles API requests and user sessions.
**Database**: PostgreSQL with Drizzle ORM is used for data storage.
**Authentication**: Session-based with secure email-based magic link login.
**Key Pages**: Includes a marketing-focused landing page (`/`), a 2-step signup flow (`/get-started`), user dashboards (`/dashboard`), podcast directories (`/podcasts`, `/podcasts/:slug`), individual episode recap and transcript pages (`/podcasts/:podcastSlug/:episodeSlug`), entity directories for people and companies (`/people`, `/companies`), and dynamic topic pages (`/topics`). All podcast and episode pages utilize shared layout components (`PodcastPageLayout`, `EpisodePageLayout`) for consistency.
**AI Integration**: Leverages OpenAI (GPT-4o) for generating high-quality episode recaps, extracting up to 10 fields (tldl, whatHappened, keyInsights, quote, keyTopics, topQuestions, sponsors, guests, resources). AI is also used for guest identification and podcast-level Q&A features.
**Email System**: Uses Resend for email delivery, with a scheduler for generating and delivering daily recaps based on user preferences.
**Admin Tools**: Features an admin dashboard for managing users, emails, content templates, and tracking episode page generation status. It includes tools for batch expansion of podcasts and backfilling various data points like show notes, Spotify URLs, key topics, and questions.
**Podcast Features**:
- **Directory**: Manages 87 podcasts, each with landing pages, AI-generated episode recaps, and social media links.
- **Hosts**: Detailed host information is stored and displayed on podcast landing pages.
- **Episode Recaps**: Enhanced with Key Topics, Top Questions, and an "Ask About This Episode" AI-powered Q&A feature.
- **Guests Tab**: Provides AI-identified guest information, including bios, social links, and topics discussed.
- **Show Notes**: Integrates raw HTML show notes from Taddy for rich episode information.
- **Podcast-Level AI**: "Ask About This Podcast" tab offers AI-generated top questions and a free-text AI search across transcripts.
**RSS Feeds**: Public and custom RSS feeds are available for all recaps or specific content, designed for bot consumption.
**Design System**: Employs a consistent design language with specific styling for content width, cards, buttons, and inputs. All pages are SEO-optimized with dynamic meta tags, OG tags, canonical URLs, and JSON-LD schema. Typography uses Inter for body text and Plus Jakarta Sans for headings.

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