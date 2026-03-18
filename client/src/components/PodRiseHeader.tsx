import { Link } from "wouter";
import logoTransparent from "@assets/Transparent-square_1773866360595.png";

interface PodRiseHeaderProps {
  rightContent?: React.ReactNode;
}

function PodRiseIcon({ size = 36 }: { size?: number }) {
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
