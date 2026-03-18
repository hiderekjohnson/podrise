# Pod Squad Referral System — Mobile App Integration Guide

This document contains everything needed to build the Pod Squad referral feature into the PodRise mobile app. The backend is fully built and ready — the mobile app just needs to call these API endpoints and handle deep links.

---

## Overview

The Pod Squad is a Morning Brew-style referral program. Users get a unique referral link, share it with friends, and unlock tiered rewards as friends sign up. The system has:

- Unique 8-character referral codes per user (auto-generated on first access)
- 7 reward tiers (admin-managed, fetched dynamically from API)
- Referral tracking on registration
- Email invite sending
- Public leaderboard
- Sharing via SMS, WhatsApp, social media, and email

---

## API Base URL

All endpoints use the same backend as the rest of the app:
```
https://podrise.com
```

Authentication uses JWT Bearer tokens (same as existing mobile auth):
```
Authorization: Bearer <access_token>
```

---

## API Endpoints

### 1. Get My Referral Stats (Authenticated)

```
GET /api/referrals/my-stats
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "referralCode": "abc12345",
  "referralLink": "https://podrise.com/r/abc12345",
  "count": 7,
  "currentTier": {
    "id": 3,
    "threshold": 5,
    "rewardName": "PodRise Premium — 1 Month Free",
    "rewardDescription": "Unlock a free month of PodRise Premium with all features.",
    "imageUrl": null,
    "sortOrder": 2,
    "active": true
  },
  "nextTier": {
    "id": 4,
    "threshold": 10,
    "rewardName": "PodRise Mug",
    "rewardDescription": "A sleek PodRise-branded ceramic mug.",
    "imageUrl": null,
    "sortOrder": 3,
    "active": true
  },
  "tiers": [
    {
      "id": 1,
      "threshold": 3,
      "rewardName": "Exclusive Sticker Pack",
      "rewardDescription": "A set of premium PodRise stickers.",
      "imageUrl": null,
      "sortOrder": 1,
      "active": true
    }
    // ... all active tiers sorted by threshold
  ]
}
```

**Notes:**
- `currentTier` is the highest tier the user has unlocked (null if none)
- `nextTier` is the next tier to unlock (null if all unlocked)
- `tiers` contains ALL active tiers sorted by threshold ascending
- The referral code is auto-generated on first call if the user doesn't have one yet

---

### 2. Get Leaderboard (Public — No Auth Required)

```
GET /api/referrals/leaderboard
```

**Response (200):**
```json
[
  {
    "userId": 42,
    "displayName": "Sarah",
    "count": 15
  },
  {
    "userId": 87,
    "displayName": "Mike",
    "count": 12
  }
]
```

**Notes:**
- Returns top 20 referrers
- Emails are never exposed — only display names
- No authentication required

---

### 3. Send Email Invite (Authenticated)

```
POST /api/referrals/send-invite
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "email": "friend@example.com"
}
```

**Response (200):**
```json
{
  "message": "Invitation sent!"
}
```

**Error Responses:**
- `400`: `{ "message": "Invalid email address" }`
- `401`: `{ "message": "Not authenticated" }`

**Notes:**
- Sends a branded HTML invitation email from PodRise on behalf of the user
- The email includes the user's referral link and their display name

---

### 4. Register with Referral Code (Mobile Auth)

```
POST /api/mobile/auth/register
Content-Type: application/json

{
  "email": "newuser@example.com",
  "podcasts": ["hubermanlab", "acquired"],
  "deliveryTime": "07:00",
  "deliveryTimezone": "America/New_York",
  "referralCode": "abc12345"
}
```

**Notes:**
- The `referralCode` field is optional — only include it if the user arrived via a referral link
- The backend automatically looks up the referrer, credits the referral, and links the new user to the referrer
- This is the same registration endpoint the mobile app already uses, just with the added optional field

---

## Deep Linking — Referral Link Handling

Referral links have the format:
```
https://podrise.com/r/{code}
```

Example: `https://podrise.com/r/abc12345`

### What the Mobile App Needs to Do:

1. **Register a Universal Link / App Link** for `podrise.com/r/*` paths
2. **When the app opens via a referral link:**
   - Extract the referral code from the URL path (the part after `/r/`)
   - Persist it locally (UserDefaults on iOS, SharedPreferences on Android, AsyncStorage in React Native)
3. **When the user registers:**
   - Read the stored referral code
   - Include it as `referralCode` in the registration request body
   - Clear it from local storage after successful registration
4. **If the app is not installed:**
   - The web fallback already handles this — `podrise.com/r/{code}` stores the code in a web session cookie and redirects to `/register`

### iOS Universal Links Setup:
Add to your `apple-app-site-association` file on `podrise.com`:
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.podrise.app",
        "paths": ["/r/*"]
      }
    ]
  }
}
```

### Android App Links Setup:
Add to your `assetlinks.json` on `podrise.com`:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.podrise.app",
    "sha256_cert_fingerprints": ["YOUR_CERT_FINGERPRINT"]
  }
}]
```

---

## Sharing — Pre-built Share Content

The mobile app should use the **native share sheet** as the primary sharing mechanism, plus dedicated buttons for specific channels.

### Share Text Template:
```
I've been using PodRise to get AI-powered podcast summaries and it's awesome. Check it out! https://podrise.com/r/{referralCode}
```

### Channel-Specific URLs:

**SMS:**
```
sms:?body=I've been using PodRise to get AI-powered podcast summaries and it's awesome. Check it out! https://podrise.com/r/{code}
```

**WhatsApp:**
```
https://wa.me/?text=I've been using PodRise to get AI-powered podcast summaries and it's awesome. Check it out! https://podrise.com/r/{code}
```

**Twitter/X:**
```
https://twitter.com/intent/tweet?text=I've been using PodRise to get AI-powered podcast summaries and it's awesome. Check it out!&url=https://podrise.com/r/{code}
```

**LinkedIn:**
```
https://www.linkedin.com/sharing/share-offsite/?url=https://podrise.com/r/{code}
```

**Facebook:**
```
https://www.facebook.com/sharer/sharer.php?u=https://podrise.com/r/{code}
```

**Remember:** URL-encode the text content when constructing these URLs.

---

## UI Design Reference

The web app's Pod Squad page serves as the design reference. Here is the layout structure to replicate in the mobile app:

### Screen Structure:

#### 1. Hero Banner
- Gradient background (indigo `#6366F1` to purple `#8B5CF6`)
- "THE POD SQUAD" badge with trophy icon
- "Referrals Get Rewarded" headline
- Subtitle text
- Referral count badge showing current count and "X more to go" for next tier

#### 2. Share Your Link Section
- Read-only text field showing the user's referral link
- "Copy Link" button (with clipboard copy + confirmation state)
- "Text a Friend" button (green, opens SMS)
- "WhatsApp" button (green, opens WhatsApp)
- Twitter, LinkedIn, Facebook buttons (secondary row)
- Native Share button (use the OS share sheet — this is the most important one for mobile)
- "Share via Email" form with email input and "Send" button (calls the send-invite API)

#### 3. Reward Tiers Section
- Vertical list of all tiers from the `tiers` array
- Each tier card shows:
  - Icon (locked or unlocked state)
  - Reward name and description
  - "Unlocked" badge (green) or "X referrals" count
  - For the NEXT tier: a progress bar showing current count / threshold
- Unlocked tiers: white/highlighted background, colored icon
- Locked tiers: muted/dimmed appearance, lock icon
- Next tier: highlighted with a ring/border and progress bar

#### 4. Leaderboard Section
- List of top referrers
- Each entry: rank number (1-20), display name, referral count
- Top 3 get special colors (gold, silver, bronze)

### Color Palette:
- Primary gradient: `#6366F1` → `#8B5CF6` (indigo to violet)
- Success/SMS: `#34C759`
- WhatsApp: `#25D366`
- Text primary: `#09090B` (dark) / `#FFFFFF` (dark mode)
- Text secondary: `#52525B` / `#A1A1AA`
- Background: `#F9F9FB` / `#09090B` (dark mode)
- Card background: `#FFFFFF` / `#111114` (dark mode)
- Border: `#ECECEE` / `#1C1C22` (dark mode)

### Tier Card Color Progression:
Each tier gets a different gradient color for its icon when unlocked:
1. Blue (`#3B82F6` → `#2563EB`)
2. Emerald (`#10B981` → `#059669`)
3. Purple (`#8B5CF6` → `#7C3AED`)
4. Orange (`#F97316` → `#EA580C`)
5. Pink (`#EC4899` → `#DB2777`)
6. Indigo (`#6366F1` → `#4F46E5`)
7. Yellow/Amber (`#EAB308` → `#F59E0B`)

---

## Default Reward Tiers

These are the 7 default tiers seeded in the database. Always use the `tiers` array from the API response rather than hardcoding — admins can change these at any time.

| Referrals | Reward | Description |
|-----------|--------|-------------|
| 3 | Exclusive Sticker Pack | A set of premium PodRise stickers |
| 5 | PodRise Premium — 1 Month Free | Unlock a free month of PodRise Premium with all features |
| 10 | PodRise Mug | A sleek PodRise-branded ceramic mug |
| 15 | Limited Edition T-Shirt | PodRise crew-neck tee, limited run |
| 25 | AirPods Pro | Top-tier audio for a top-tier referrer |
| 50 | Annual Premium Membership | A full year of PodRise Premium, on us |
| 100 | VIP Experience Package | Exclusive VIP access and premium perks |

---

## Unauthenticated State

If the user is not logged in, the Pod Squad screen should show:
- The Pod Squad icon and title
- A message: "Sign up or log in to start earning rewards by sharing PodRise with friends."
- "Sign Up" and "Log In" buttons

---

## TypeScript Interfaces

Use these interfaces for type safety in the mobile app:

```typescript
interface ReferralTier {
  id: number;
  threshold: number;
  rewardName: string;
  rewardDescription: string;
  imageUrl: string | null;
  sortOrder: number;
  active: boolean;
}

interface ReferralStats {
  referralCode: string;
  referralLink: string;
  count: number;
  currentTier: ReferralTier | null;
  nextTier: ReferralTier | null;
  tiers: ReferralTier[];
}

interface LeaderboardEntry {
  userId: number;
  displayName: string;
  count: number;
}
```

---

## Implementation Checklist

- [ ] Deep link handler for `podrise.com/r/*` URLs
- [ ] Local storage for referral code persistence (survives app close)
- [ ] Pass `referralCode` in `POST /api/mobile/auth/register` body
- [ ] Pod Squad screen with hero banner, share section, tiers, leaderboard
- [ ] Fetch stats from `GET /api/referrals/my-stats`
- [ ] Fetch leaderboard from `GET /api/referrals/leaderboard`
- [ ] Copy referral link to clipboard
- [ ] Native share sheet integration with referral link
- [ ] SMS share button (`sms:?body=...`)
- [ ] WhatsApp share button (`whatsapp://send?text=...`)
- [ ] Twitter/LinkedIn/Facebook share buttons
- [ ] Email invite form calling `POST /api/referrals/send-invite`
- [ ] Tier progression visualization with progress bar for next tier
- [ ] Leaderboard display with rank styling (gold/silver/bronze for top 3)
- [ ] Unauthenticated fallback screen
- [ ] Dark mode support
