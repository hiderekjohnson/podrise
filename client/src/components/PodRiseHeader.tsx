import { Link } from "wouter";

interface PodRiseHeaderProps {
  rightContent?: React.ReactNode;
}

/**
 * PodRiseWordmark — the ONLY logo component for the PodRise brand.
 *
 * IMPORTANT LOGO RULES:
 * - Use <PodRiseWordmark /> for ALL logo placements (headers, footers, standalone pages).
 * - It renders `/logo-transparent.svg` which already contains both the icon AND "PodRise" text.
 * - NEVER add separate "PodRise" text next to this component — that creates a double logo.
 * - NEVER use `Transparent-square_1773866360595.png` as a small icon next to text —
 *   that PNG also contains the full "PodRise" text baked into the image.
 * - For emails, use the hosted PNG version at the production URL.
 */
function PodRiseWordmark({ variant = "light", height = 72 }: { variant?: "light" | "dark" | "color"; height?: number }) {
  return (
    <img
      src="/logo-transparent.svg"
      alt="PodRise"
      style={{ height: `${height}px`, width: "auto" }}
      className={`object-contain${variant === "dark" || variant === "color" ? " brightness-0 invert" : ""}`}
      data-testid="img-podrise-wordmark"
    />
  );
}

/**
 * PodRiseIcon — square logo icon only, for contexts like favicons, app icons, or small badges.
 * WARNING: This PNG contains the full "PodRise" text inside it.
 * Do NOT place text like "PodRise" next to this — use PodRiseWordmark instead.
 */
function PodRiseIcon({ size = 52 }: { size?: number }) {
  return (
    <img
      src="/logo-transparent.svg"
      alt="PodRise"
      style={{ height: `${size}px`, width: "auto" }}
      className="object-contain"
      aria-hidden="true"
      data-testid="img-podrise-icon"
    />
  );
}

export function PodRiseHeader({ rightContent }: PodRiseHeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-black/[0.04]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-[68px] flex items-center justify-between">
        <Link href="/">
          <span data-testid="link-home-logo">
            <PodRiseWordmark />
          </span>
        </Link>
        {rightContent}
      </div>
    </header>
  );
}

export { PodRiseIcon, PodRiseWordmark };
