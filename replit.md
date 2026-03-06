# PodCap - Daily Podcast Digest

A full-stack web application that lets users create and manage personalized daily podcast digest subscriptions.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + Shadcn UI, using `wouter` for routing
- **Backend**: Express.js with session-based auth
- **Database**: PostgreSQL via Drizzle ORM
- **Payments**: Stripe via Replit integration (`stripe-replit-sync` for webhook/data sync)
- **Styling**: Custom design with Plus Jakarta Sans display font, clean white cards with subtle borders
- **Brand**: PodCap logo (`attached_assets/Podcap_logo_1772731738179.png`), primary blue `hsl(207, 90%, 54%)`, warm off-white background `hsl(30, 20%, 97%)`

## Pages
- `/` — Onboarding: 2-step signup flow (select 3 podcasts with auto-advance, enter email)
- `/login` — Email-based login for existing users
- `/dashboard` — Manage podcasts, delivery time/timezone (full IANA searchable selector with auto-detect), email, vacation mode, and plan/billing
- `/upgrade` — Pro upgrade page ($9.99/month for unlimited podcasts) with Stripe Checkout
- `/admin` — Admin dashboard (password-protected): pending emails queue, users, email send logs, analytics, email template editor, AI prompt editor, transcript logs (2 tabs: Successful / Errors); tabbed interface (defaults to Pending tab)
- `/podcasts` — Most Popular Podcasts directory/leaderboard
- `/podcasts/:slug` — SEO landing pages for ~50 podcasts (data in `client/src/data/podcastLandingData.ts`); centered artwork hero, email signup, Apple/Spotify/YouTube links, feature cards, example AI recap, episode list (if episodes exist), snapshot stats, known-for bullets, host bios, related podcasts, FAQ with schema markup, aboutPodcast SEO description
- `/podcasts/:podcastSlug/:episodeSlug` — Individual episode recap pages (data in `client/src/data/episodeRecaps.ts`); artwork + title hero, TLDL box, recap sections, prev/next episode nav, signup CTA, related podcasts, full SEO (canonical, OG, twitter tags). Currently 5 My First Million episodes as test
- `/podcast-deals` — SEO page listing sponsor deals extracted from podcast transcripts (promo codes, free trials, special links, discounts). FAQ schema, ItemList schema, internal linking. Admin triggers extraction via "Extract Deals" button
- `/updates` — What's New changelog + feature request form. SEO-optimized with JSON-LD, meta tags. Changelog entries first, feature request form at bottom
- `/support` — Help & Support contact form
- `/privacy` — Privacy Policy
- `/terms` — Terms & Conditions

## Database Schema
- `users` table: id, email (unique), podcasts (text array), delivery_time, delivery_timezone, stripe_customer_id, stripe_subscription_id, plan (default "free"), created_at
- `recaps` table: id, user_id, recap_date, podcasts (text array), summary, created_at
- `episode_transcripts` table: id, podcast_id, episode_guid (unique), episode_title, transcript, fetched_at — caches Taddy transcripts
- `email_logs` table: id, user_id, recipient_email, podcasts (text array), source ("manual"|"scheduled"), email_html (text), sent_at
- `magic_links` table: id, email, token (unique), expires_at, used_at, created_at
- `email_template_settings` table: id, key (unique), value — admin-editable email template settings
- `pending_emails` table: id, user_id, recipient_email, podcasts (text array), recap_date, summary, email_html, subject, scheduled_for, timezone, status (pending/sent/cancelled/error), sent_at, error_message, created_at
- `transcript_logs` table: id, user_id, podcast_name, podcast_id, episode_title, taddy_uuid, status, transcript_length, error_message, created_at
- `podcast_example_recaps` table: id, slug (unique), podcast_name, itunes_id, episode_title, episode_date, episode_duration, tldl, what_happened, key_insights (text array), quote, quote_attribution, updated_at
- `podcast_deals` table: id, podcast_name, podcast_id, podcast_slug, episode_title, episode_date, sponsor_name, offer_summary, promo_code, special_link, deal_type, deal_category, detected_at
- `stripe.*` tables: managed automatically by `stripe-replit-sync`

## Auth Flow
- Signup via onboarding creates user record + session
- Login via magic link: user enters email → server generates 32-byte token (15-min expiry), sends branded email via Resend → user clicks link → `GET /api/auth/magic?token=...` validates token, creates session, redirects to `/dashboard`
- Invalid/expired magic links redirect to `/login?error=invalid` or `/login?error=expired`
- Sessions stored in PostgreSQL via `connect-pg-simple`
- Cancel subscription: handles graceful downgrade for accounts with plan="pro" but no Stripe subscription ID (manually-granted pro accounts)

## Stripe / Payment Flow
- Stripe connected via Replit integration (handles sandbox/live keys automatically)
- `stripe-replit-sync` runs migrations on startup, sets up managed webhook, backfill sync
- Webhook route registered BEFORE `express.json()` middleware in `server/index.ts`
- Product "PodCap Pro" ($9.99/month) created via `server/seed-products.ts`
- Checkout: `POST /api/stripe/create-checkout` creates Stripe customer + checkout session
- After checkout success: redirects to `/dashboard?upgraded=true`, calls `/api/stripe/sync-subscription`
- Pro users get unlimited podcasts

## Podcast Data
- Search powered by iTunes Search API (proxied through backend)
- Each selected podcast stored as JSON string `{id, name, artworkUrl}` in text array column
- PodcastSearch component shared between Home (onboarding) and Dashboard
- Landing page data: ~50 entries in `podcastLandingData.ts` with YouTube URLs, host bios, known-for bullets, related slugs
- Server-side mapping: `server/podcastLandingMap.ts` — `ITUNES_ID_TO_SLUG` and `SLUG_TO_ITUNES_ID`

## API Routes
- `GET /api/podcasts/search?term=...` — Search podcasts via iTunes API
- `POST /api/auth/register` — Create account + session
- `POST /api/auth/login` — Login by email + session
- `GET /api/auth/me` — Get current user
- `POST /api/auth/logout` — Destroy session
- `POST /api/users/update` — Update user preferences
- `GET /api/recaps` — Get all recaps for authenticated user
- `POST /api/recaps/generate` — Generate AI recap from user's podcasts
- `POST /api/admin/login` — Admin login
- `GET /api/admin/me` — Check admin session
- `POST /api/admin/logout` — Admin logout
- `GET /api/admin/users` — Get all users (admin only)
- `GET /api/admin/email-logs` — Get email send history (admin only, last 500)
- `POST /api/admin/extract-deals` — Trigger deal extraction from transcripts
- `GET /api/stripe/publishable-key` — Get Stripe publishable key
- `POST /api/stripe/create-checkout` — Create Stripe checkout session
- `GET /api/stripe/subscription` — Get user's subscription status
- `POST /api/stripe/portal` — Create Stripe billing portal session
- `POST /api/stripe/sync-subscription` — Sync subscription status
- `POST /api/stripe/cancel-subscription` — Cancel subscription (handles null subscription ID gracefully)
- `GET /api/podcasts/:slug/example-recap` — Get example recap for podcast landing page
- `GET /api/podcast-deals` — Get extracted podcast deals
- `POST /api/support` — Submit support/feature request (sends email via Resend)

## AI Integration
- OpenAI via Replit AI Integrations
- Recap generation: `server/recapGenerator.ts` fetches episodes from iTunes, filters to yesterday's releases, sends to GPT-4o-mini
- Summary format: Stats Header, per-episode cards with TLDL, What Happened (prose), Key Insights, Quote with attribution
- Admin-editable AI prompt stored in `email_template_settings` (key: `recapPrompt`)
- Transcript Integration: Taddy GraphQL API (`TADDY_USER_ID=4391` + `TADDY_API_KEY`)
  - Matches iTunes episodes to Taddy by podcast iTunes ID → Taddy UUID → episode title match
  - Transcripts cached in `episode_transcripts` table
  - Transcript excerpts (up to 8000 chars) fed to GPT for more accurate output
- Deal extraction: `server/dealExtractor.ts` — extracts sponsor deals from transcripts via GPT

## Email System
- **Provider**: Resend via Replit connector, from address: `digest@podcap.io`
- **Scheduler**: `server/emailScheduler.ts` — two-phase system:
  1. Pre-generation (7:00 UTC daily): Batch-generates all recap emails, stores in `pending_emails` with status "pending"
  2. Delivery (every 60 seconds): Sends pending emails when user's delivery time arrives in their timezone
- **Admin controls**: Generate Now, preview, cancel, send-now any pending email
- **Email Template**: `server/emailTemplate.ts` converts markdown to styled HTML with merge tags
- **Notification**: Admin notified at `hiderekjohnson@gmail.com`

## Key Files
- `shared/schema.ts` — Drizzle schema + Zod validation
- `server/routes.ts` — Express route handlers
- `server/storage.ts` — Database storage layer
- `server/stripeClient.ts` — Stripe client setup
- `server/recapGenerator.ts` — Recap generation logic
- `server/taddyClient.ts` — Taddy GraphQL API client
- `server/resendClient.ts` — Resend email client
- `server/emailTemplate.ts` — Email template converter
- `server/emailScheduler.ts` — Background scheduler
- `server/dealExtractor.ts` — Sponsor deal extraction from transcripts
- `server/podcastLandingMap.ts` — iTunes ID ↔ slug mapping
- `client/src/data/podcastLandingData.ts` — Landing page data for ~50 podcasts
- `client/src/components/ExampleRecapSection.tsx` — Example recap component for landing pages
- `client/src/components/Footer.tsx` — Shared footer with links to Podcasts, Deals, Privacy, Terms, Support, What's New
- `client/src/pages/PodcastLandingGeneric.tsx` — Individual podcast landing/signup pages
- `client/src/pages/FeatureRequests.tsx` — What's New changelog + feature request form
- `client/src/pages/Home.tsx` — Onboarding page
- `client/src/pages/Dashboard.tsx` — Dashboard page
- `client/src/pages/Admin.tsx` — Admin dashboard

## Design System
- Max content width: `max-w-3xl` for content pages, `max-w-2xl` for focused forms
- Cards: `bg-white border border-black/[0.06] rounded-2xl` (clean, no heavy shadows)
- Glass panel: `bg-white border border-black/[0.06] shadow-xl shadow-black/[0.05]` (used sparingly for CTAs)
- Buttons: `rounded-xl font-display font-bold` with primary shadow
- Inputs: `h-11 or h-12, rounded-xl, border-black/[0.08]`
- Animations: `framer-motion` with `y: 16` entry, 0.5s duration, staggered delays
- Typography: font-display (Plus Jakarta Sans) for headings, system font for body
- SEO: Each page sets title, meta description, OG tags, canonical URL, JSON-LD schema

## Important: User Data Safety
- NEVER bulk-delete user accounts. All user accounts are real users.
- Only delete individual accounts via the admin panel delete button (with confirmation).
- The 8 core user accounts are: ss@contactsheet.org, johnsonjessicanoel@gmail.com, hiderekjohnson@gmail.com, kpfitz@gmail.com, alexdmitt@gmail.com, brissonemail@gmail.com, badonnelly84@gmail.com, ru1@mac.com
