import { useState } from "react";
import { Link } from "wouter";
import { Calendar, ArrowRight } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/hooks/use-auth";
import { hiResArtwork } from "@/lib/utils";
import { BlurredInsightGate } from "@/components/BlurredInsightGate";
import { SignUpCTAModal } from "@/components/SignUpCTAModal";
import { RecapAudioPlayer } from "@/components/RecapAudioPlayer";
import { usePrefetchPodcast } from "@/lib/queryClient";

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

export { hiResArtwork };

export function getHeaderTint(source: string): { light: string; dark: string } {
  const hash = source ? source.split("").reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  const tints = [
    { light: "#F0F0FF", dark: "rgba(99,102,241,0.06)" },
    { light: "#F0FBF5", dark: "rgba(34,197,94,0.06)" },
    { light: "#FEF8ED", dark: "rgba(245,158,11,0.06)" },
    { light: "#FEF0F5", dark: "rgba(236,72,153,0.06)" },
    { light: "#F0F8FF", dark: "rgba(59,130,246,0.06)" },
  ];
  return tints[hash % tints.length];
}

export function EpisodeContentSection({ podcastSlug, episodeSlug, episodeTitle, tldl, publishDate, testIdPrefix, isLoggedIn }: {
  podcastSlug: string;
  episodeSlug: string;
  episodeTitle: string;
  tldl?: string | null;
  publishDate?: string | null;
  testIdPrefix: string;
  isLoggedIn?: boolean;
}) {
  const titleRow = (
    <div className="flex items-baseline justify-between gap-3 mb-[10px]">
      <span className="text-[13px] text-[#71717A] dark:text-[#8B8B95] overflow-hidden text-ellipsis line-clamp-2 flex-1 min-w-0 leading-[1.4]" style={{ fontFamily: "var(--font-mono)" }} data-testid={`${testIdPrefix}-episode-title-${episodeSlug}`}>
        {episodeTitle}
      </span>
      {publishDate && (
        <span className="text-[12px] text-[#A1A1AA] whitespace-nowrap flex-shrink-0" style={{ fontFamily: "var(--font-mono)" }} data-testid={`${testIdPrefix}-time-${episodeSlug}`}>
          {relativeTime(publishDate)}
        </span>
      )}
    </div>
  );

  return (
    <div className="px-5 md:px-6 py-[18px] border-t border-[#F0F0F2] dark:border-[#1C1C22] border-b border-b-[#F0F0F2] dark:border-b-[#1C1C22]">
      {isLoggedIn ? titleRow : (
        <Link href={`/podcasts/${podcastSlug}/${episodeSlug}`} className="block group">
          {titleRow}
        </Link>
      )}
      {tldl && (
        <h3 className="text-[25px] sm:text-[26px] font-normal text-[#09090B] dark:text-white leading-[1.22] tracking-[-0.015em]" style={{ fontFamily: "var(--font-serif)" }} data-testid={`${testIdPrefix}-tldl-${episodeSlug}`}>
          {tldl}
        </h3>
      )}
      {isLoggedIn && (
        <div className="mt-3">
          <RecapAudioPlayer podcastSlug={podcastSlug} episodeSlug={episodeSlug} compact />
        </div>
      )}
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
  adBadge = false,
}: FeedEpisodeCardProps) {
  const { theme } = useTheme();
  const { data: authUser } = useAuth();
  const [showSignUpCTA, setShowSignUpCTA] = useState(false);
  const headerTint = getHeaderTint(artworkUrl || podcastSlug);
  const tintBg = theme === "dark" ? headerTint.dark : headerTint.light;
  const insights = keyInsights || [];
  const { onMouseEnter, onMouseLeave } = usePrefetchPodcast(podcastSlug, !!authUser);

  return (
    <article
      className="bg-white dark:bg-[#111114] border border-[#E4E4E7] dark:border-[#1C1C22] rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]"
      data-testid={`${testIdPrefix}-${episodeSlug}`}
    >
      <div
        className="flex items-center gap-4 sm:gap-5 px-5 md:px-6 py-5"
        style={{ background: tintBg }}
      >
        <Link href={`/podcasts/${podcastSlug}`} className="w-[88px] h-[88px] sm:w-[124px] sm:h-[124px] rounded-[16px] overflow-hidden flex-shrink-0 shadow-[0_4px_16px_rgba(0,0,0,0.14),0_1px_3px_rgba(0,0,0,0.06)] border border-black/[0.06] dark:border-white/[0.06] block" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
          {artworkUrl ? (
            <img src={hiResArtwork(artworkUrl)} alt={podcastName} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full bg-[#F4F4F5] dark:bg-[#1C1C22] flex items-center justify-center">
              <Calendar className="w-6 h-6 text-[#A1A1AA]" />
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          {adBadge && (
            <span className="inline-block text-[10px] font-bold uppercase tracking-[0.08em] text-[#A1A1AA] bg-white/60 dark:bg-white/[0.06] px-2 py-0.5 rounded mb-1.5" data-testid={`${testIdPrefix}-ad-badge`}>
              Ad
            </span>
          )}
          <Link href={`/podcasts/${podcastSlug}`} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
            <span className="text-[17px] sm:text-[18px] font-extrabold text-[#09090B] dark:text-white tracking-[-0.02em] leading-[1.15] block hover:text-[#6366F1] transition-colors overflow-hidden text-ellipsis" data-testid={`${testIdPrefix}-podcast-name-${episodeSlug}`}>
              {podcastName}
            </span>
          </Link>
          {hosts && (
            <div className="flex items-center gap-[5px] text-[13px] text-[#71717A] dark:text-[#8B8B95] mt-1.5">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="opacity-40 flex-shrink-0"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z"/></svg>
              <span className="truncate">{hosts}</span>
            </div>
          )}
          {duration && !hosts && (
            <div className="text-[12px] text-[#A1A1AA] mt-1.5">{duration}</div>
          )}
        </div>
        {headerAction && (
          <div className="flex-shrink-0 flex items-center">
            {headerAction}
          </div>
        )}
      </div>

      <EpisodeContentSection
        podcastSlug={podcastSlug}
        episodeSlug={episodeSlug}
        episodeTitle={episodeTitle}
        tldl={tldl}
        publishDate={publishDate}
        testIdPrefix={testIdPrefix}
        isLoggedIn={!!authUser}
      />

      {(insights.length > 0 || quote) && (
        <div className="px-5 md:px-6 pt-5 pb-5">
          {insights.length > 0 && (
            <div className={quote ? "mb-5" : ""}>
              <div className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#A1A1AA] dark:text-[#71717A] mb-3" style={{ fontFamily: "var(--font-mono)" }}>Key Takeaways</div>
              <ul className="list-none p-0">
                {insights.map((insight, i) => {
                  if (i === 3 && insights.length >= 4 && !authUser) {
                    return (
                      <BlurredInsightGate key={i} as="li" onRevealClick={() => setShowSignUpCTA(true)} className="flex items-start gap-3 py-[10px] border-b border-[#F0F0F2] dark:border-[#1C1C22] text-[16px] text-[#3F3F46] dark:text-[#A1A1AA] leading-[1.6] last:border-b-0 last:pb-0" data-testid={`feed-insight-${i}`}>
                        <div className="flex items-start gap-3">
                          <div className="w-[6px] h-[6px] rounded-full bg-[#6366F1] flex-shrink-0 mt-[9px]" />
                          <div>{insight}</div>
                        </div>
                      </BlurredInsightGate>
                    );
                  }

                  return (
                    <li key={i} className="flex items-start gap-3 py-[10px] border-b border-[#F0F0F2] dark:border-[#1C1C22] text-[16px] text-[#3F3F46] dark:text-[#A1A1AA] leading-[1.6] first:pt-0 last:border-b-0 last:pb-0" data-testid={`feed-insight-${i}`}>
                      <div className="w-[6px] h-[6px] rounded-full bg-[#6366F1] flex-shrink-0 mt-[9px]" />
                      <div>{insight}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {quote && (
            <div className="border-l-[3px] border-[#8B5CF6] rounded-r-[10px] px-[18px] py-[14px] bg-[#F7F7FC] dark:bg-[#18181B]">
              <div className="text-[17px] italic text-[#52525B] dark:text-[#A1A1AA] leading-[1.65] mb-2" style={{ fontFamily: "var(--font-serif)" }} data-testid={`${testIdPrefix}-quote-${episodeSlug}`}>
                "{quote}"
              </div>
              {quoteAttribution && (
                <div className="text-[12px] text-[#A1A1AA] dark:text-[#71717A]" style={{ fontFamily: "var(--font-mono)" }}>— {quoteAttribution}</div>
              )}
            </div>
          )}
        </div>
      )}

      {additionalContent}

      {bottomActions}

      <SignUpCTAModal
        open={showSignUpCTA}
        onClose={() => setShowSignUpCTA(false)}
      />
    </article>
  );
}
