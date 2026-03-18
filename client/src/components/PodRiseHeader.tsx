import { Link } from "wouter";

interface PodRiseHeaderProps {
  rightContent?: React.ReactNode;
}

function PodRiseIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="56" height="56" rx="16" fill="url(#headerGrad)" />
      <g transform="translate(28, 28)" fill="white">
        <rect x="-20" y="-6" width="4" height="12" rx="2" opacity="0.5" />
        <rect x="-13" y="-12" width="4" height="24" rx="2" opacity="0.7" />
        <rect x="-6" y="-16" width="4" height="32" rx="2" opacity="1" />
        <rect x="1" y="-11" width="4" height="22" rx="2" opacity="0.9" />
        <rect x="8" y="-14" width="4" height="28" rx="2" opacity="1" />
        <rect x="15" y="-8" width="4" height="16" rx="2" opacity="0.6" />
      </g>
      <circle cx="46" cy="10" r="4" fill="white" opacity="0.9" />
      <defs>
        <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function PodRiseWordmark({ variant = "light" }: { variant?: "light" | "dark" | "color" }) {
  const podColor = variant === "dark" || variant === "color" ? "text-white" : "text-[#09090B]";
  const riseColor = variant === "dark" ? "text-[#A5B4FC]" : variant === "color" ? "text-white" : "text-[#6366F1]";
  return (
    <span className="flex items-center gap-2.5" style={{ letterSpacing: "-0.04em" }} role="img" aria-label="PodRise">
      <PodRiseIcon size={36} />
      <span className="text-xl leading-none">
        <span className={`font-semibold ${podColor}`}>Pod</span>
        <span className={`font-light ${riseColor}`}>Rise</span>
      </span>
    </span>
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
