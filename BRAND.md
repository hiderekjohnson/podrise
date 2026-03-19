# PodRise Brand Guide

Every new page, component, and email template must reference this file before any styling decisions are made. This is the single source of truth for all design and accessibility decisions. No exceptions.

## Typography

- **Font family**: DM Sans for all UI text. DM Mono for dates, metadata, and code. DM Serif Display for editorial headlines only.
- **Minimum font size**: 16px for all body text. Never below 14px for any visible text anywhere in the product. Labels and captions minimum 12px only when space is genuinely constrained.
- **Line height**: 1.6 minimum for body text. 1.3 minimum for headlines.
- **Font weights**: 300 for light wordmark text, 400 for body, 500 for labels and UI, 600 for headlines, 700 for hero headings only.

## Colors

- **Primary**: #6366F1 (Indigo)
- **Accent**: #8B5CF6 (Violet)
- **Gradient**: linear-gradient(145deg, #6366F1, #8B5CF6)
- **Indigo light**: #A5B4FC
- **Dark base**: #08080F
- **Light background**: #F7F7FC
- **White**: #FFFFFF
- **Text primary**: #09090B
- **Text secondary**: #52525B
- **Text muted**: #A1A1AA
- **Border default**: #F0F0F2
- **Border medium**: #E4E4E7

## Accessibility — WCAG AA minimum, AAA where possible

- All body text must achieve a minimum contrast ratio of 4.5:1 against its background.
- Large text (18px+ regular or 14px+ bold) minimum contrast ratio 3:1.
- Never use #A1A1AA text on white for anything other than purely decorative or metadata text. For readable content use #52525B minimum on white.
- Never use placeholder text as a label. Always provide visible labels for all form inputs.
- All interactive elements must have a visible focus indicator (3px solid #6366F1 outline with 3px offset).
- Touch targets: minimum 44×44px on mobile.
- Skip links and semantic HTML landmarks on every page.

## Buttons

- **Primary**: background #6366F1, text white, border-radius 9px, padding 12px 22px, font-size 15px, font-weight 600. Hover: background #4F46E5.
- Never use a border-radius above 12px on buttons except for pill-shaped secondary buttons.
- **Disabled state**: opacity 0.5, cursor not-allowed.

## Spacing

- **Base unit**: 4px. All spacing must be multiples of 4.
- **Content padding on mobile**: 20px minimum.
- **Content padding on desktop**: 28px minimum.
- **Section gaps**: 32px minimum between major sections.

## Components

- **Cards**: background white, border 1px solid #F0F0F2, border-radius 12px, padding 24px.
- **Input fields**: border 1px solid #E4E4E7, border-radius 8px, padding 12px 16px, font-size 16px minimum, focus border #6366F1.
- **Takeaway blocks**: background #F7F7FC, border-left 3px solid show accent color, border-radius 0 8px 8px 0, padding 16px 20px.
- **Mention blocks**: same as takeaway blocks.

## Logo Usage

- Always use the official brand logo files. Never stretch, recolor, or alter the logo.
- Minimum size: 28px height. Clear space: minimum 8px on all sides.
- On dark backgrounds: use white wordmark with indigo gradient icon.
- On light backgrounds: use dark (#09090B) wordmark with indigo gradient icon.

## Logo Assets

All official brand logo files live in `client/public/`:

| File | Format | Variant | Use When |
|------|--------|---------|----------|
| `logo-transparent.svg` | SVG rectangle | Transparent background | Header wordmark, footer, anywhere the full brand name is needed on light or dark backgrounds |
| `logo-white.svg` | SVG rectangle | White background | Social sharing, email headers, contexts where a white card background is preferred |
| `logo-square-transparent.png` | PNG square | Transparent background | Sidebar icon, app icon, small square placements, og:image fallback, email template logo |
| `logo-square-white.png` | PNG square | White background | Social avatars, partner listings, contexts requiring a solid white background |
| `favicon.png` | PNG (full-res) | Transparent | Primary favicon (high-res) |
| `favicon-32.png` | PNG 32×32 | Transparent | Browser tab favicon |
| `apple-touch-icon.png` | PNG 180×180 | Transparent | iOS home screen icon |
| `favicon.ico` | ICO 32×32 | Transparent | Legacy browser favicon |
| `podrise-logo.png` | PNG square | Transparent | Served at `/podrise-logo.png` for external references |
| `podrise-logo.svg` | SVG rectangle | Transparent | Served at `/podrise-logo.svg` for external references |

In React components, import the square PNG via `import logoTransparent from "@assets/Transparent-square_1773866360595.png"` for the `PodRiseIcon` component. The `PodRiseWordmark` component renders the single `logo-transparent.svg` wordmark image (with CSS invert for dark/color variants).

## Enforcement

- Every time a new page or component is built, add a comment at the top: `// See BRAND.md for all typography, color, spacing, and accessibility rules.`
- Every code change affecting UI must be checked against this file before applying.
- If a color, font size, spacing value, or interactive element not in this file is used, it must be justified in a comment or added to BRAND.md first.
- Run an accessibility audit using Replit's browser preview before marking any page as done. All text must pass WCAG AA contrast ratios.

## CSS Variables Reference

```css
--font-sans: 'DM Sans'
--font-serif: 'DM Serif Display'
--font-mono: 'DM Mono'
--color-primary: #6366F1
--color-violet: #8B5CF6
--color-indigo-light: #A5B4FC
--color-heading: #09090B
--color-body: #09090B
--color-secondary: #52525B
--color-muted: #A1A1AA
--color-border: #F0F0F2
--color-border-medium: #E4E4E7
--color-surface-light: #F7F7FC
--color-bg-dark: #08080F
```
