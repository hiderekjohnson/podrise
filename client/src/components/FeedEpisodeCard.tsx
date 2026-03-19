import { Link } from "wouter";
import { Calendar, ArrowRight } from "lucide-react";

export function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function hiResArtwork(url: string | null): string {
  if (!url) return "";
  if (url.startsWith("/artwork/")) return url;
  return url.replace(/\/\d+x\d+bb\./, "/100x100bb.");
}

export function getHeaderTint(source: string): string {
  const hash = source ? source.split("").reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  const tints = ["#F0F0FF", "#F0FBF5", "#FEF8ED", "#FEF0F5", "#F0F8FF"];
  return tints[hash % tints.length];
}

export function EpisodeContentSection({ podcastSlug, episodeSlug, episodeTitle, tldl, publishDate, testIdPrefix }: {
  podcastSlug: string;
  episodeSlug: string;
  episodeTitle: string;
  tldl?: string | null;
  publishDate?: string | null;
  testIdPrefix: string;
}) {
  return (
    <div className="px-5 md:px-6 py-[18px] border-t border-[#F0F0F2] dark:border-[#1C1C22] border-b border-b-[#F0F0F2] dark:border-b-[#1C1C22]">
      <Link href={`/podcasts/${podcastSlug}/${episodeSlug}`} className="block group">
        <div className="flex items-baseline justify-between gap-3 mb-[9px]">
          <span className="text-[12px] text-[#A1A1AA] overflow-hidden text-ellipsis line-clamp-2 flex-1 min-w-0" style={{ fontFamily: "var(--font-mono)" }} data-testid={`${testIdPrefix}-episode-title-${episodeSlug}`}>
            {episodeTitle}
          </span>
          {publishDate && (
            <span className="text-[12px] text-[#A1A1AA] whitespace-nowrap flex-shrink-0" style={{ fontFamily: "var(--font-mono)" }} data-testid={`${testIdPrefix}-time-${episodeSlug}`}>
              {relativeTime(publishDate)}
            </span>
          )}
        </div>
        {tldl && (
          <h3 className="text-[26px] font-normal text-[#09090B] dark:text-white leading-[1.2] tracking-[-0.01em] group-hover:text-[#6366F1] transition-colors" style={{ fontFamily: "var(--font-serif)" }} data-testid={`${testIdPrefix}-tldl-${episodeSlug}`}>
            {tldl}
          </h3>
        )}
      </Link>
    </div>
  );
}

export function InsightsSection({ insights, testIdPrefix }: { insights: string[]; testIdPrefix: string }) {
  if (insights.length === 0) return null;
  return (
    <div className="px-5 md:px-6 pb-4 pt-[22px]">
      <div className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#A1A1AA] mb-3" style={{ fontFamily: "var(--font-mono)" }}>Key Takeaways</div>
      <ul className="list-none p-0">
        {insights.map((insight, i) => (
          <li key={i} className="flex items-start gap-3 py-[10px] border-b border-[#F0F0F2] dark:border-[#1C1C22] text-[16px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.6] first:pt-0 last:border-b-0 last:pb-0">
            <div className="w-[7px] h-[7px] rounded-full bg-[#6366F1] flex-shrink-0 mt-[8px]" />
            <div>{insight}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function QuoteSection({ quote, quoteAttribution, testIdPrefix }: { quote: string; quoteAttribution?: string | null; testIdPrefix: string }) {
  return (
    <div className="px-5 md:px-6 pb-4">
      <div className="border-l-[3px] border-[#8B5CF6] rounded-r-[10px] px-[18px] py-[14px] bg-[#F7F7FC] dark:bg-[#1C1C22]">
        <div className="text-[18px] italic text-[#52525B] dark:text-[#A1A1AA] leading-[1.65] mb-2" style={{ fontFamily: "var(--font-serif)" }} data-testid={`${testIdPrefix}-quote`}>
          "{quote}"
        </div>
        {quoteAttribution && (
          <div className="text-[12px] text-[#A1A1AA]" style={{ fontFamily: "var(--font-mono)" }}>— {quoteAttribution}</div>
        )}
      </div>
    </div>
  );
}

export interface FeedEpisodeCardProps {
  podcastSlug: string;
  episodeSlug: string;
  podcastName: string;
  episodeTitle: string;
  publishDate: string | null;
  artworkUrl: string | null;
  tldl?: string | null;
  keyInsights?: string[] | null;
  quote?: string | null;
  quoteAttribution?: string | null;
  duration?: string;
  testIdPrefix?: string;
  bottomActions?: React.ReactNode;
  headerAction?: React.ReactNode;
  additionalContent?: React.ReactNode;
  hosts?: string;
  totalEpisodes?: number;
  yearStarted?: number;
  adBadge?: boolean;
}

export function FeedEpisodeCard({
  podcastSlug,
  episodeSlug,
  podcastName,
  episodeTitle,
  publishDate,
  artworkUrl,
  tldl,
  keyInsights,
  quote,
  quoteAttribution,
  duration,
  testIdPrefix = "feed-episode",
  bottomActions,
  headerAction,
  additionalContent,
  hosts,
  totalEpisodes,
  yearStarted,
  adBadge = false,
}: FeedEpisodeCardProps) {
  const headerTint = getHeaderTint(artworkUrl || podcastSlug);
  const insights = keyInsights || [];

  return (
    <article
      className="bg-white dark:bg-[#111114] border border-[#E4E4E7] dark:border-[#1C1C22] rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
      data-testid={`${testIdPrefix}-${episodeSlug}`}
    >
      <div className="flex items-start gap-[18px] px-5 md:px-6 pt-5 pb-[18px]" style={{ background: headerTint }}>
        <div className="w-[80px] h-[80px] sm:w-[120px] sm:h-[120px] rounded-[14px] overflow-hidden flex-shrink-0 shadow-[0_4px_16px_rgba(0,0,0,0.16),0_1px_3px_rgba(0,0,0,0.08)] border border-black/[0.08]">
          {artworkUrl ? (
            <img src={hiResArtwork(artworkUrl)} alt={podcastName} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full bg-[#F4F4F5] dark:bg-[#1C1C22] flex items-center justify-center">
              <Calendar className="w-6 h-6 text-[#A1A1AA]" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center min-h-[80px] sm:min-h-[120px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {adBadge && (
                <span className="inline-block text-[10px] font-bold uppercase tracking-[0.08em] text-[#A1A1AA] bg-[#F4F4F5] dark:bg-[#27272A] px-2 py-0.5 rounded mb-1.5" data-testid={`${testIdPrefix}-ad-badge`}>
                  Ad
                </span>
              )}
              <Link href={`/podcasts/${podcastSlug}`}>
                <span className="text-[18px] font-extrabold text-[#09090B] dark:text-white tracking-[-0.02em] leading-[1.1] mb-2 block hover:text-[#6366F1] transition-colors overflow-hidden text-ellipsis" data-testid={`${testIdPrefix}-podcast-name-${episodeSlug}`}>
                  {podcastName}
                </span>
              </Link>
              <div className="flex items-center gap-[14px] flex-wrap">
                {hosts && (
                  <div className="flex items-center gap-[5px] text-[14px] text-[#71717A] whitespace-nowrap">
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="opacity-40 flex-shrink-0"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z"/></svg>
                    {hosts}
                  </div>
                )}
                {totalEpisodes && (
                  <div className="flex items-center gap-[5px] text-[14px] text-[#71717A] whitespace-nowrap">
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="opacity-40 flex-shrink-0"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd"/></svg>
                    {totalEpisodes}+ episodes
                  </div>
                )}
                {yearStarted && (
                  <div className="flex items-center gap-[5px] text-[14px] text-[#71717A] whitespace-nowrap">
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="opacity-40 flex-shrink-0"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>
                    Since {yearStarted}
                  </div>
                )}
                {duration && !hosts && !totalEpisodes && !yearStarted && (
                  <div className="flex items-center gap-2 text-[12px] text-[#A1A1AA]">
                    <span>{duration}</span>
                  </div>
                )}
              </div>
              <div className="w-[30px] h-[3px] rounded-full bg-[#6366F1]/40 mt-3" />
            </div>
            {headerAction && (
              <div className="flex-shrink-0 pt-0.5">
                {headerAction}
              </div>
            )}
          </div>
        </div>
      </div>

      <EpisodeContentSection
        podcastSlug={podcastSlug}
        episodeSlug={episodeSlug}
        episodeTitle={episodeTitle}
        tldl={tldl}
        publishDate={publishDate}
        testIdPrefix={testIdPrefix}
      />

      <div className="px-5 md:px-6 py-[22px]">
        {insights.length > 0 && (
          <div className="mb-5">
            <div className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#A1A1AA] mb-3" style={{ fontFamily: "var(--font-mono)" }}>Key Takeaways</div>
            <ul className="list-none p-0">
              {insights.map((insight, i) => (
                <li key={i} className="flex items-start gap-3 py-[10px] border-b border-[#F0F0F2] dark:border-[#1C1C22] text-[16px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.6] first:pt-0 last:border-b-0 last:pb-0">
                  <div className="w-[7px] h-[7px] rounded-full bg-[#6366F1] flex-shrink-0 mt-[8px]" />
                  <div>{insight}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {quote && (
          <div className="border-l-[3px] border-[#8B5CF6] rounded-r-[10px] px-[18px] py-[14px] bg-[#F7F7FC] dark:bg-[#1C1C22]">
            <div className="text-[18px] italic text-[#52525B] dark:text-[#A1A1AA] leading-[1.65] mb-2" style={{ fontFamily: "var(--font-serif)" }} data-testid={`${testIdPrefix}-quote-${episodeSlug}`}>
              "{quote}"
            </div>
            {quoteAttribution && (
              <div className="text-[12px] text-[#A1A1AA]" style={{ fontFamily: "var(--font-mono)" }}>— {quoteAttribution}</div>
            )}
          </div>
        )}
      </div>

      {additionalContent}

      {bottomActions}
    </article>
  );
}
