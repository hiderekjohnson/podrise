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
    sm: "text-[12px] px-2 py-0.5 gap-1",
    md: "text-[14px] px-2.5 py-1 gap-1.5",
    lg: "text-[16px] px-3 py-1.5 gap-2",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-3.5 h-3.5",
    lg: "w-4 h-4",
  };

  return (
    <span
      className={`inline-flex items-center font-bold rounded-full bg-gradient-to-r from-[#6366F1]/[0.12] to-[#8B5CF6]/[0.12] text-[#6366F1] dark:from-[#6366F1]/[0.18] dark:to-[#8B5CF6]/[0.18] dark:text-[#A5B4FC] border border-[#6366F1]/[0.15] dark:border-[#6366F1]/[0.25] ${sizeClasses[size]} ${className}`}
      data-testid="podcast-mic-badge"
    >
      <span className="relative flex items-center justify-center">
        <Mic className={`${iconSizes[size]} drop-shadow-[0_0_3px_rgba(99,102,241,0.4)]`} />
      </span>
      {label || `${count} ${count === 1 ? "podcast" : "podcasts"}`}
    </span>
  );
}
