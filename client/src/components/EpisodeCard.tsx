import { Link } from "wouter";
import { Calendar, ArrowRight } from "lucide-react";

interface EpisodeCardProps {
  episodeSlug: string;
  podcastSlug: string;
  publishDate: string;
  episodeTitle: string;
  tldl?: string;
  duration?: string;
  testIdPrefix?: string;
}

export function EpisodeCard({
  episodeSlug,
  podcastSlug,
  publishDate,
  episodeTitle,
  tldl,
  duration,
  testIdPrefix = "card-episode",
}: EpisodeCardProps) {
  const date = new Date(publishDate + "T00:00:00");
  const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <Link href={`/podcasts/${podcastSlug}/${episodeSlug}`} className="block">
      <div
        className="bg-white dark:bg-zinc-900 border border-black/[0.1] dark:border-white/[0.1] rounded-xl px-6 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] hover:shadow-md hover:shadow-black/[0.06] hover:border-primary/[0.2] transition-all cursor-pointer group"
        data-testid={`${testIdPrefix}-${episodeSlug}`}
      >
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground/40" />
          <span className="text-base font-semibold text-[#52525B]">{formatted}</span>
          {duration && (
            <>
              <span className="w-0.5 h-0.5 rounded-full bg-black/[0.12] dark:bg-white/[0.12]" />
              <span className="text-base text-[#3F3F46] dark:text-[#A1A1AA]/50">{duration}</span>
            </>
          )}
        </div>
        <p className="text-[16px] font-bold text-foreground group-hover:text-primary transition-colors leading-snug">{episodeTitle}</p>
        {tldl && <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-1.5 leading-relaxed line-clamp-2">{tldl}</p>}
        <span className="inline-flex items-center gap-1.5 text-base font-medium text-primary/50 group-hover:text-primary transition-colors mt-3">
          See full episode recap
          <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}
