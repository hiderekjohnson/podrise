# PodCap - Daily Podcast Digest

A full-stack web application that lets users create and manage personalized daily podcast digest subscriptions.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + Shadcn UI, using `wouter` for routing
- **Backend**: Express.js with session-based auth
- **Database**: PostgreSQL via Drizzle ORM
- **Styling**: Custom glassmorphism design with Plus Jakarta Sans display font
- **Brand**: PodCap logo (`attached_assets/image_1772641542609.png`), primary blue `hsl(207, 90%, 54%)`

## Pages
- `/` — Onboarding: 2-step signup flow (select 3 podcasts with auto-advance, enter email)
- `/login` — Email-based login for existing users
- `/dashboard` — Manage podcasts, reading length, delivery time/timezone, and email preferences
- `/upgrade` — Pro upgrade page ($9.99/month for unlimited podcasts)
- `/admin` — Admin dashboard (password-protected): view all users, their emails, signup dates, and podcasts

## Database Schema
- `users` table: id, email (unique), podcasts (text array), reading_length, delivery_time (default "07:00"), delivery_timezone (default "America/New_York"), created_at
- `recaps` table: id, user_id, recap_date (date), podcasts (text array), summary (text), created_at

## Auth Flow
- Signup via onboarding creates user record + session
- Login by email lookup (no password) + session
- Sessions stored server-side via `express-session`

## Podcast Data
- Search powered by iTunes Search API (proxied through backend to avoid CORS)
- Each selected podcast stored as a JSON string `{id, name, artworkUrl}` in the text array column
- Fallback icon shown for podcasts with missing artwork
- PodcastSearch component shared between Home (onboarding) and Dashboard

## API Routes
- `GET /api/podcasts/search?term=...` — Search podcasts via iTunes API (returns id, name, artistName, artworkUrl)
- `POST /api/auth/register` — Create account + session
- `POST /api/auth/login` — Login by email + session
- `GET /api/auth/me` — Get current user
- `POST /api/auth/logout` — Destroy session
- `POST /api/users/update` — Update user preferences (email, readingLength, podcasts, deliveryTime, deliveryTimezone)
- `GET /api/recaps` — Get all recaps for authenticated user
- `POST /api/recaps/generate` — Generate AI recap from user's podcasts (fetches recent episodes from iTunes, summarizes via OpenAI)
- `POST /api/admin/login` — Admin login (validates against ADMIN_PASSWORD env var)
- `GET /api/admin/me` — Check admin session
- `POST /api/admin/logout` — Admin logout
- `GET /api/admin/users` — Get all users (admin only)

## AI Integration
- OpenAI via Replit AI Integrations (env vars: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`)
- Recap generation: fetches 3 most recent episodes per podcast from iTunes lookup API, sends to GPT-4o-mini for digest summary
- Summary rendered as markdown in recap modal using `react-markdown`

## Key Files
- `shared/schema.ts` — Drizzle schema + Zod validation
- `shared/routes.ts` — API contract definitions
- `server/routes.ts` — Express route handlers with session middleware
- `server/storage.ts` — Database storage layer
- `client/src/hooks/use-auth.ts` — Auth hooks (useAuth, useRegister, useLogin, useLogout, useUpdateUser)
- `client/src/pages/Home.tsx` — Onboarding page
- `client/src/pages/Login.tsx` — Login page
- `client/src/pages/Dashboard.tsx` — Dashboard page
- `client/src/pages/Admin.tsx` — Admin dashboard page
