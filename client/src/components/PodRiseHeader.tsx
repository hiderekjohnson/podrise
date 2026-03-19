import { Link } from "wouter";
import logoTransparent from "@assets/Transparent-square_1773866360595.png";

interface PodRiseHeaderProps {
  rightContent?: React.ReactNode;
}

function PodRiseIcon({ size = 52 }: { size?: number }) {
  return (
    <img
      src={logoTransparent}
      alt=""
      width={size}
      height={size}
      className="rounded-[10px] object-contain"
      aria-hidden="true"
      data-testid="img-podrise-icon"
    />
  );
}

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
