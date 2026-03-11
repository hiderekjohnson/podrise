import { Link } from "wouter";

interface PodCapHeaderProps {
  rightContent?: React.ReactNode;
}

function PodCapIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="11" fill="url(#headerGrad)" />
      <rect x="6" y="20" width="5" height="9" rx="2.5" fill="white" opacity="0.5" />
      <rect x="13" y="14" width="5" height="20" rx="2.5" fill="white" opacity="0.75" />
      <rect x="20" y="8" width="5" height="29" rx="2.5" fill="white" />
      <rect x="27" y="15" width="5" height="17" rx="2.5" fill="white" opacity="0.85" />
      <rect x="34" y="10" width="5" height="25" rx="2.5" fill="white" opacity="0.6" />
      <circle cx="37" cy="5" r="3.5" fill="white" />
      <defs>
        <linearGradient id="headerGrad" x1="0" y1="0" x2="40" y2="40">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function PodCapWordmark({ variant = "light" }: { variant?: "light" | "dark" | "color" }) {
  const podColor = variant === "dark" || variant === "color" ? "text-white" : "text-zinc-900";
  const capColor = variant === "dark" ? "text-[#A5B4FC]" : variant === "color" ? "text-white" : "text-[#6366F1]";
  return (
    <span className="flex items-center gap-2" style={{ letterSpacing: "-0.04em" }}>
      <PodCapIcon size={28} />
      <span className="text-lg leading-none">
        <span className={`font-semibold ${podColor}`}>Pod</span>
        <span className={`font-light ${capColor}`}>Cap</span>
      </span>
    </span>
  );
}

export function PodCapHeader({ rightContent }: PodCapHeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-black/[0.04]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/">
          <span data-testid="link-home-logo">
            <PodCapWordmark />
          </span>
        </Link>
        {rightContent}
      </div>
    </header>
  );
}

export { PodCapIcon, PodCapWordmark };
