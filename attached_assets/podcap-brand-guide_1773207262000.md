# PodCap Brand Guide
> For use with Replit / website updates

---

## Colors

### Primary Palette
| Name          | Hex       | Usage                          |
|---------------|-----------|--------------------------------|
| Indigo        | `#6366F1` | Primary brand color, CTAs, links |
| Violet        | `#8B5CF6` | Accent, hover states           |
| Indigo Light  | `#A5B4FC` | "Cap" in wordmark, dark bg text |
| Indigo Pale   | `#818CF8` | Secondary text on dark         |

### Gradient
```css
background: linear-gradient(145deg, #6366F1, #8B5CF6);
```
Also used as bright variant (profile photo, hero):
```css
background: linear-gradient(160deg, #9333EA, #4F46E5);
```

### Neutral / Background
| Name          | Hex       | Usage                          |
|---------------|-----------|--------------------------------|
| Dark Base     | `#08080F` | Primary dark background        |
| Dark Surface  | `#0D0D1F` | Cards, panels on dark bg       |
| Light BG      | `#F7F7FC` | Light mode background          |
| Light Surface | `#F4F4F5` | Cards on light bg              |
| Zinc 800      | `#27272A` | Borders on dark                |
| Zinc 400      | `#A1A1AA` | Muted text                     |
| Zinc 600      | `#52525B` | Subtle text, URLs              |

---

## Typography

### Fonts
```
Primary:   DM Sans     — https://fonts.google.com/specimen/DM+Sans
Monospace: DM Mono     — https://fonts.google.com/specimen/DM+Mono
```

Google Fonts import:
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### Font Weights
| Weight | Value | Usage                        |
|--------|-------|------------------------------|
| Light  | 300   | "Cap" in wordmark, subtitles |
| Regular| 400   | Body text                    |
| Medium | 500   | UI labels                    |
| Semi   | 600   | "Pod" in wordmark, headings  |
| Bold   | 700   | Hero headlines               |

### Letter Spacing
- Headings: `-0.04em`
- Body: `normal`
- Monospace / URLs: `+0.06em`

### Type Scale (suggested)
```css
--text-xs:   12px;
--text-sm:   14px;
--text-base: 16px;
--text-lg:   18px;
--text-xl:   20px;
--text-2xl:  24px;
--text-3xl:  30px;
--text-4xl:  36px;
--text-5xl:  48px;
--text-6xl:  60px;
--text-7xl:  72px;
```

---

## Logo

### Wordmark Construction
- **"Pod"** — DM Sans 600 (semibold), white on dark / dark on light
- **"Cap"** — DM Sans 300 (light), `#A5B4FC` on dark / `#6366F1` on light
- Letter spacing: `-0.04em`
- Always display as one word: **Pod**Cap (no space)

### Icon (SVG — waveform in rounded square)
```svg
<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="40" height="40" rx="11" fill="url(#grad)"/>
  <rect x="6"  y="20" width="5" height="9"  rx="2.5" fill="white" opacity="0.5"/>
  <rect x="13" y="14" width="5" height="20" rx="2.5" fill="white" opacity="0.75"/>
  <rect x="20" y="8"  width="5" height="29" rx="2.5" fill="white"/>
  <rect x="27" y="15" width="5" height="17" rx="2.5" fill="white" opacity="0.85"/>
  <rect x="34" y="10" width="5" height="25" rx="2.5" fill="white" opacity="0.6"/>
  <circle cx="37" cy="5" r="3.5" fill="white"/>
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="40" y2="40">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#8B5CF6"/>
    </linearGradient>
  </defs>
</svg>
```

### Icon Sizes & Corner Radius Formula
```
corner-radius = size × 0.27

16px  → radius: 4px
24px  → radius: 6px
32px  → radius: 9px
40px  → radius: 11px
48px  → radius: 13px
64px  → radius: 17px
96px  → radius: 26px
```

### Logo Variants
| Variant        | Background | "Pod" color | "Cap" color |
|----------------|------------|-------------|-------------|
| Dark (primary) | `#08080F`  | `#FFFFFF`   | `#A5B4FC`   |
| Light          | `#F7F7FC`  | `#18181B`   | `#6366F1`   |
| Color          | gradient   | `#FFFFFF`   | `#FFFFFF`   |
| Icon only      | gradient   | —           | —           |

---

## Spacing & Radius

```css
/* Border radius */
--radius-sm:  6px;
--radius-md:  10px;
--radius-lg:  14px;
--radius-xl:  20px;
--radius-full: 9999px;  /* pills */

/* Spacing scale (8pt grid) */
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-6:  24px;
--space-8:  32px;
--space-12: 48px;
--space-16: 64px;
```

---

## Shadows & Glows

```css
/* Icon glow */
box-shadow: 0 0 0 1px rgba(255,255,255,0.1), 0 6px 24px rgba(99,102,241,0.5);

/* Card on dark */
box-shadow: 0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(99,102,241,0.15);

/* Indigo glow (hover/focus) */
box-shadow: 0 0 0 3px rgba(99,102,241,0.35);
```

---

## CSS Variables (copy-paste ready)

```css
:root {
  /* Brand */
  --color-indigo:       #6366F1;
  --color-violet:       #8B5CF6;
  --color-indigo-light: #A5B4FC;
  --color-indigo-pale:  #818CF8;

  /* Dark theme */
  --color-bg:           #08080F;
  --color-surface:      #0D0D1F;
  --color-border:       #27272A;
  --color-text:         #FFFFFF;
  --color-text-muted:   #A1A1AA;
  --color-text-subtle:  #52525B;

  /* Light theme */
  --color-bg-light:      #F7F7FC;
  --color-surface-light: #F4F4F5;
  --color-text-light:    #18181B;

  /* Gradients */
  --gradient-brand:   linear-gradient(145deg, #6366F1, #8B5CF6);
  --gradient-bright:  linear-gradient(160deg, #9333EA, #4F46E5);

  /* Typography */
  --font-sans:  'DM Sans', system-ui, sans-serif;
  --font-mono:  'DM Mono', monospace;

  /* Radius */
  --radius-sm:   6px;
  --radius-md:   10px;
  --radius-lg:   14px;
  --radius-xl:   20px;
  --radius-full: 9999px;
}
```

---

## Social Asset Sizes

| Asset            | Size       | Notes                        |
|------------------|------------|------------------------------|
| X/Twitter banner | 1500×500px | Key content within 1200×500  |
| X/Twitter avatar | 800×800px  | Displayed as circle          |
| OG / link preview| 1200×630px | og:image meta tag            |
| Favicon          | 32×32px    | Icon only, no wordmark       |

---

*Brand by PodCap — podcap.io*
