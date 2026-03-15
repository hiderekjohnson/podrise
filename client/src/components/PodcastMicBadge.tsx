import { Mic } from "lucide-react";

interface PodcastMicBadgeProps {
  count: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

export function PodcastMicBadge({ count, size = "md", className = "", label }: PodcastMicBadgeProps) {
  if (count < 1) return null;

  const sizeClasses = {
    sm: "gap-1.5",
    md: "gap-2",
    lg: "gap-2.5",
  };

  const iconSizes = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  const textSizes = {
    sm: "text-[14px]",
    md: "text-[16px]",
    lg: "text-[18px]",
  };

  return (
    <span
      className={`inline-flex items-center ${sizeClasses[size]} ${className}`}
      data-testid="podcast-mic-badge"
    >
      <Mic className={`${iconSizes[size]} text-[#6366F1] dark:text-[#818CF8]`} />
      <span className={`${textSizes[size]} font-bold text-[#18181B] dark:text-white`}>
        {label || String(count)}
      </span>
    </span>
  );
}
