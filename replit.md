# PodCap - Daily Podcast Digest

A full-stack web application that lets users create and manage personalized daily podcast digest subscriptions.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + Shadcn UI, using `wouter` for routing
- **Backend**: Express.js with session-based auth
- **Database**: PostgreSQL via Drizzle ORM
- **Payments**: Stripe via Replit integration (`stripe-replit-sync` for webhook/data sync)
- **Styling**: Custom glassmorphism design with Plus Jakarta Sans display font
- **Brand**: PodCap logo (`attached_assets/image_1772641542609.png`), primary blue `hsl(207, 90%, 54%)`

## Pages
- `/` — Onboarding: 2-step signup flow (select 3 podcasts with auto-advance, enter email)
- `/login` — Email-based login for existing users
- `/dashboard` — Manage podcasts, reading length, delivery time/timezone, email, and plan/billing
- `/upgrade` — Pro upgrade page ($9.99/month for unlimited podcasts) with Stripe Checkout
- `/admin` — Admin dashboard (password-protected): view all users, email send logs; tabbed interface

## Database Schema
- `users` table: id, email (unique), podcasts (text array), reading_length, delivery_time, delivery_timezone, stripe_customer_id, stripe_subscription_id, plan (default "free"), created_at
- `recaps` table: id, user_id, recap_date, podcasts (text array), summary, created_at
- `episode_transcripts` table: id, podcast_id, episode_guid (unique), episode_title, transcript, fetched_at — caches Taddy transcripts
- `email_logs` table: id, user_id, recipient_email, podcasts (text array), source ("manual"|"scheduled"), sent_at
- `magic_links` table: id, email, token (unique), expires_at, used_at, created_at — stores magic link tokens for passwordless login
- `stripe.*` tables: managed automatically by `stripe-replit-sync` (products, prices, customers, subscriptions, etc.)

## Auth Flow
- Signup via onboarding creates user record + session
- Login via magic link: user enters email → server generates 32-byte token (15-min expiry), sends branded email via Resend → user clicks link → `GET /api/auth/magic?token=...` validates token, creates session, redirects to `/dashboard`
- Invalid/expired magic links redirect to `/login?error=invalid` or `/login?error=expired` with inline error alert
- Sessions stored in PostgreSQL via `connect-pg-simple`
- Dashboard invalidates auth cache on mount to ensure fresh session after magic link redirect

## Stripe / Payment Flow
- Stripe connected via Replit integration (handles sandbox/live keys automatically)
- `stripe-replit-sync` runs migrations on startup to create `stripe` schema, sets up managed webhook, and does backfill sync
- Webhook route registered BEFORE `express.json()` middleware in `server/index.ts`
- Product "PodCap Pro" ($9.99/month) created via `server/seed-products.ts`
- Checkout: `POST /api/stripe/create-checkout` creates Stripe customer + checkout session
- After checkout success: redirects to `/dashboard?upgraded=true`, which calls `/api/stripe/sync-subscription` to sync plan status
- Pro users get unlimited podcasts (no `maxSelection` limit on PodcastSearch)
- Dashboard shows Plan section with "Upgrade to Pro" or "Manage Billing" (Stripe portal)

## Podcast Data
- Search powered by iTunes Search API (proxied through backend to avoid CORS)
- Each selected podcast stored as a JSON string `{id, name, artworkUrl}` in the text array column
- PodcastSearch component shared between Home (onboarding) and Dashboard

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
- `GET /api/stripe/publishable-key` — Get Stripe publishable key
- `POST /api/stripe/create-checkout` — Create Stripe checkout session
- `GET /api/stripe/subscription` — Get user's subscription status
- `POST /api/stripe/portal` — Create Stripe billing portal session
- `POST /api/stripe/sync-subscription` — Sync subscription status from Stripe

## AI Integration
- OpenAI via Replit AI Integrations
- Recap generation: shared `server/recapGenerator.ts` module fetches episodes from iTunes, filters to yesterday's releases, sends to GPT-4o-mini
- Summary includes stats header (podcast count, total runtime, recap time, time saved), per-episode Apple Podcasts + Spotify links
- Summary follows specific format: Stats Header, Big Ideas Today, per-episode cards with listen links, Conversation Ammo
- **Transcript Integration**: Taddy GraphQL API fetches real podcast transcripts for richer recaps
  - Credentials: `TADDY_USER_ID` (shared env) + `TADDY_API_KEY` (secret)
  - Matches iTunes episodes to Taddy by podcast iTunes ID → Taddy UUID → episode title match
  - Transcripts cached in `episode_transcripts` table (keyed by episode_guid) to avoid redundant API calls
  - Falls back to iTunes episode descriptions when no transcript is available
  - Transcript excerpts (up to 8000 chars) fed to GPT for more accurate quotes, facts, and insights

## Email System
- **Provider**: Resend via Replit connector integration
- **Scheduler**: `server/emailScheduler.ts` runs every 60 seconds, checks each user's delivery time + timezone
  - Only sends if current time in user's timezone matches their `deliveryTime` setting
  - Skips users who already received email today (in-memory `sentToday` set, resets at midnight UTC)
  - Skips if no new episodes from yesterday — no email sent
  - Generates recap, saves to DB, converts markdown to HTML, sends via Resend
- **Email Template**: `server/emailTemplate.ts` converts markdown recap to styled HTML email
- **Manual Send**: Users can click "Send to Email" on any recap in the dashboard viewer
- **API Route**: `POST /api/recaps/send-email` sends a specific recap to the user's email

## Key Files
- `shared/schema.ts` — Drizzle schema + Zod validation
- `shared/routes.ts` — API contract definitions
- `server/routes.ts` — Express route handlers with session middleware
- `server/storage.ts` — Database storage layer
- `server/stripeClient.ts` — Stripe client setup (credentials from Replit connector)
- `server/webhookHandlers.ts` — Stripe webhook processing
- `server/recapGenerator.ts` — Shared recap generation logic (iTunes fetch, Taddy transcripts, GPT prompt with stats + links)
- `server/taddyClient.ts` — Taddy GraphQL API client for podcast search + transcript fetching
- `server/resendClient.ts` — Resend email client (via Replit connector)
- `server/emailTemplate.ts` — Markdown-to-HTML email template converter
- `server/emailScheduler.ts` — Background scheduler for automated daily email delivery
- `server/seed-products.ts` — Script to create Stripe products
- `server/index.ts` — Server entry point (Stripe init + webhook route before JSON middleware)
- `client/src/hooks/use-auth.ts` — Auth hooks
- `client/src/pages/Home.tsx` — Onboarding page
- `client/src/pages/Dashboard.tsx` — Dashboard page
- `client/src/pages/Upgrade.tsx` — Upgrade page with Stripe checkout
- `client/src/pages/Admin.tsx` — Admin dashboard page
