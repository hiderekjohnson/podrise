# Daily Podcast Digest

A full-stack web application that lets users create and manage personalized daily podcast digest subscriptions.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + Shadcn UI, using `wouter` for routing
- **Backend**: Express.js with session-based auth
- **Database**: PostgreSQL via Drizzle ORM
- **Styling**: Custom glassmorphism design with Plus Jakarta Sans display font

## Pages
- `/` — Onboarding: 3-step signup flow (select podcasts, choose reading length, enter email)
- `/login` — Email-based login for existing users
- `/dashboard` — Manage podcasts, reading length, and email preferences

## Database Schema
- `users` table: id, email (unique), podcasts (text array), reading_length, created_at

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
- `POST /api/users/update` — Update user preferences (email, readingLength, podcasts)

## Key Files
- `shared/schema.ts` — Drizzle schema + Zod validation
- `shared/routes.ts` — API contract definitions
- `server/routes.ts` — Express route handlers with session middleware
- `server/storage.ts` — Database storage layer
- `client/src/hooks/use-auth.ts` — Auth hooks (useAuth, useRegister, useLogin, useLogout, useUpdateUser)
- `client/src/pages/Home.tsx` — Onboarding page
- `client/src/pages/Login.tsx` — Login page
- `client/src/pages/Dashboard.tsx` — Dashboard page
