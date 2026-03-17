import { Link } from "wouter";
import { Calendar, ArrowRight } from "lucide-react";

interface EpisodeCardProps {
  episodeSlug: string;
  podcastSlug: string;
  publishDate: string;
  episodeTitle: string;
  tldl?: string;
  duration?: string;
  artworkUrl?: string;
  testIdPrefix?: string;
}

export function EpisodeCard({
  episodeSlug,
  podcastSlug,
  publishDate,
  episodeTitle,
  tldl,
  duration,
  artworkUrl,
  testIdPrefix = "card-episode",
}: EpisodeCardProps) {
  const date = new Date(publishDate + "T00:00:00");
  const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <Link href={`/podcasts/${podcastSlug}/${episodeSlug}`} className="block">
      <div
        className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-white/[0.1] rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)] hover:shadow-md hover:shadow-black/[0.06] hover:border-[#6366F1]/20 transition-all cursor-pointer group"
        data-testid={`${testIdPrefix}-${episodeSlug}`}
      >
        <div className="flex items-start gap-4 p-5 md:px-6">
          {artworkUrl && (
            <div className="w-[72px] h-[72px] rounded-[12px] overflow-hidden flex-shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.12)] border border-black/[0.06]">
              <img src={artworkUrl} alt={episodeTitle} className="w-full h-full object-cover" loading="lazy" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-[6px]">
              <Calendar className="w-3.5 h-3.5 text-[#A1A1AA]/60" />
              <span className="text-[13px] font-semibold text-[#71717A]">{formatted}</span>
              {duration && (
                <>
                  <span className="w-[3px] h-[3px] rounded-full bg-[#D4D4D8]" />
                  <span className="text-[13px] text-[#71717A]">{duration}</span>
                </>
              )}
            </div>
            <p className="text-[16px] font-bold text-[#09090B] dark:text-white group-hover:text-[#6366F1] transition-colors leading-snug">{episodeTitle}</p>
            {tldl && <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] mt-1.5 leading-relaxed line-clamp-2">{tldl}</p>}
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6366F1]/50 group-hover:text-[#6366F1] transition-colors mt-3">
              See full recap
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
