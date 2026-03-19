import { Link } from "wouter";

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
  testIdPrefix = "card-episode",
}: EpisodeCardProps) {
  const date = new Date(publishDate + "T00:00:00");
  const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div
      className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-white/[0.1] rounded-xl px-5 py-[18px]"
      data-testid={`${testIdPrefix}-${episodeSlug}`}
    >
      <div className="flex items-center gap-2 text-[12px] text-[#A1A1AA] mb-[6px]">
        <span>{formatted}</span>
        {duration && (
          <>
            <span className="w-[3px] h-[3px] rounded-full bg-[#D4D4D8] inline-block" />
            <span>{duration}</span>
          </>
        )}
      </div>
      <Link
        href={`/podcasts/${podcastSlug}/${episodeSlug}`}
        className="text-[15px] font-medium text-[#6366F1] leading-[1.4] hover:underline block mb-2"
        data-testid={`link-episode-title-${episodeSlug}`}
      >
        {episodeTitle}
      </Link>
      {tldl && (
        <p className="text-[13px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.6] line-clamp-2 mb-3">{tldl}</p>
      )}
      <Link
        href={`/podcasts/${podcastSlug}/${episodeSlug}`}
        className="text-[13px] font-medium text-[#6366F1] hover:underline"
        data-testid={`link-episode-recap-${episodeSlug}`}
      >
        See full recap →
      </Link>
    </div>
  );
}
