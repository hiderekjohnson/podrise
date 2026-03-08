# PodCap - Daily Podcast Digest

## Overview
PodCap is a full-stack web application designed to provide users with personalized daily podcast digest subscriptions. It allows users to manage their podcast selections, receive AI-generated recaps, and access detailed episode information. The project aims to deliver a seamless and intuitive experience for podcast enthusiasts, offering a unique service in the podcast consumption market. PodCap seeks to simplify podcast discovery and recap delivery, making it easier for users to stay updated with their favorite shows.

## User Preferences
- **User Data Safety**: NEVER bulk-delete user accounts. All user accounts are real users. Only delete individual accounts via the admin panel delete button (with confirmation). The 8 core user accounts are: ss@contactsheet.org, johnsonjessicanoel@gmail.com, hiderekjohnson@gmail.com, kpfitz@gmail.com, alexdmitt@gmail.com, brissonemail@gmail.com, badonnelly84@gmail.com, ru1@mac.com

## System Architecture
**Frontend**: The user interface is built with React, Vite, Tailwind CSS, and Shadcn UI, utilizing `wouter` for routing. The design emphasizes clean white cards with subtle borders and uses Plus Jakarta Sans for display fonts. Animations are handled with `framer-motion`.
**Backend**: An Express.js server manages API requests and user sessions.
**Database**: PostgreSQL is used for data storage, accessed via Drizzle ORM.
**Authentication**: Session-based authentication is implemented, featuring a secure email-based magic link login flow.
**Pages**:
- **Onboarding/Home**: `/` for a 2-step signup.
- **User Management**: `/login`, `/dashboard` (manage subscriptions, delivery, billing), `/upgrade`.
- **Content Discovery**: `/podcasts` (popular directory), `/podcasts/:slug` (SEO landing pages for podcasts with recaps and episode lists), `/podcasts/:slug/episodes` (episode archive), `/podcasts/:podcastSlug/:episodeSlug` (individual episode recaps), `/podcasts/:podcastSlug/:episodeSlug/transcript` (full transcript page). Both recap and transcript pages use the shared `EpisodePageLayout` component for header/hero/tabs/CTA/more-episodes/footer/sticky-bar — changes to shared elements propagate automatically.
- **Informational/Admin**: `/about`, `/podcast-deals`, `/updates` (changelog + feature requests), `/support`, `/privacy`, `/terms`, `/admin` (password-protected admin dashboard with tools for managing emails, users, analytics, and content templates).
**AI Integration**: Utilizes OpenAI (GPT-4o-mini) for generating daily podcast recaps and extracting sponsor deals from transcripts. Transcripts are processed from Taddy GraphQL API. AI prompts are admin-editable.
**Email System**: Uses Resend for email delivery, with a two-phase scheduler for generating and delivering daily recaps based on user preferences and timezones. An admin panel allows monitoring and management of email operations.
**Design System**: Features a consistent design language with `max-w-3xl` for content, `bg-white border border-black/[0.06] rounded-2xl` for cards, `rounded-xl font-display font-bold` for buttons, and `h-11 or h-12, rounded-xl, border-black/[0.08]` for inputs. All pages are SEO-optimized with dynamic meta tags, OG tags, canonical URLs, and JSON-LD schema.

## External Dependencies
- **Stripe**: Integrated for payment processing and subscription management, leveraging Replit's `stripe-replit-sync` for webhook and data synchronization.
- **OpenAI**: Used for AI-driven podcast recap generation and deal extraction from transcripts.
- **Taddy GraphQL API**: Provides podcast transcription services, used for generating accurate recaps and for the server-rendered transcript pages.
- **iTunes Search API**: Powers the podcast search functionality for user subscription selection.
- **Resend**: The chosen email service provider for sending daily podcast digests and magic links.
- **`connect-pg-simple`**: Used for storing Express sessions in PostgreSQL.
- **`framer-motion`**: Library for animations in the frontend.