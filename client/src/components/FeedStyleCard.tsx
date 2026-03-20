import { Link } from "wouter";
import { hiResArtwork } from "@/lib/utils";

function getHeaderTint(identifier: string): string {
  const hash = identifier ? identifier.split("").reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  const tints = ["#F0F0FF", "#F0FBF5", "#FEF8ED", "#FEF0F5", "#F0F8FF"];
  return tints[hash % tints.length];
}

interface MetaItem {
  icon: "host" | "episodes" | "since" | "mentions";
  text: string;
}

interface FeedStyleCardHeaderProps {
  imageUrl: string;
  imageAlt: string;
  imageLink?: string;
  imageRounded?: "rounded-[14px]" | "rounded-full" | "rounded-xl";
  name: string;
  nameLink?: string;
  subtitle?: string;
  meta?: MetaItem[];
  rightAction?: React.ReactNode;
  tintSource?: string;
  testIdPrefix?: string;
}

const META_ICONS = {
  host: (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="opacity-40 flex-shrink-0">
      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
    </svg>
  ),
  episodes: (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="opacity-40 flex-shrink-0">
      <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
    </svg>
  ),
  since: (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="opacity-40 flex-shrink-0">
      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
    </svg>
  ),
  mentions: (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="opacity-40 flex-shrink-0">
      <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z" clipRule="evenodd" />
    </svg>
  ),
};

export function FeedStyleCardHeader({
  imageUrl,
  imageAlt,
  imageLink,
  imageRounded = "rounded-[14px]",
  name,
  nameLink,
  subtitle,
  meta = [],
  rightAction,
  tintSource,
  testIdPrefix = "feed-card",
}: FeedStyleCardHeaderProps) {
  const headerTint = getHeaderTint(tintSource || imageUrl || name);

  const imgElement = (
    <div className={`w-[120px] h-[120px] ${imageRounded} overflow-hidden flex-shrink-0 shadow-[0_4px_16px_rgba(0,0,0,0.16),0_1px_3px_rgba(0,0,0,0.08)] border border-black/[0.08]`}>
      <img
        src={imageRounded === "rounded-[14px]" ? hiResArtwork(imageUrl) : imageUrl}
        alt={imageAlt}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).src = "/people/default-avatar.png";
        }}
        data-testid={`${testIdPrefix}-image`}
      />
    </div>
  );

  return (
    <div
      className="flex items-start gap-[18px] px-5 md:px-6 pt-5 pb-[18px]"
      style={{ background: headerTint }}
      data-testid={`${testIdPrefix}-header`}
    >
      {imageLink ? (
        <Link href={imageLink} className="flex-shrink-0">
          {imgElement}
        </Link>
      ) : (
        imgElement
      )}
      <div className="flex-1 min-w-0 flex flex-col justify-center min-h-[120px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {nameLink ? (
              <Link href={nameLink}>
                <span
                  className="text-[18px] font-extrabold text-[#09090B] tracking-[-0.02em] leading-[1.1] mb-2 block hover:text-[#6366F1] transition-colors overflow-hidden text-ellipsis"
                  data-testid={`${testIdPrefix}-name`}
                >
                  {name}
                </span>
              </Link>
            ) : (
              <span
                className="text-[18px] font-extrabold text-[#09090B] tracking-[-0.02em] leading-[1.1] mb-2 block"
                data-testid={`${testIdPrefix}-name`}
              >
                {name}
              </span>
            )}
            {subtitle && (
              <span className="text-[14px] text-[#71717A] block mb-1" data-testid={`${testIdPrefix}-subtitle`}>
                {subtitle}
              </span>
            )}
            {meta.length > 0 && (
              <div className="flex items-center gap-[14px] flex-wrap">
                {meta.map((m, i) => (
                  <div key={i} className="flex items-center gap-[5px] text-[14px] text-[#71717A] whitespace-nowrap">
                    {META_ICONS[m.icon]}
                    {m.text}
                  </div>
                ))}
              </div>
            )}
            <div className="w-[30px] h-[3px] rounded-full bg-[#6366F1]/40 mt-3" />
          </div>
          {rightAction && (
            <div className="flex-shrink-0 pt-0.5">
              {rightAction}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface FeedStyleCardProps {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

export function FeedStyleCard({ children, className = "", testId }: FeedStyleCardProps) {
  return (
    <article
      className={`bg-white border border-[#E4E4E7] rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)] ${className}`}
      data-testid={testId}
    >
      {children}
    </article>
  );
}

interface FeedStyleCardSectionProps {
  children: React.ReactNode;
  className?: string;
  noBorder?: boolean;
}

export function FeedStyleCardSection({ children, className = "", noBorder }: FeedStyleCardSectionProps) {
  return (
    <div className={`px-5 md:px-6 py-[18px] ${noBorder ? "" : "border-t border-[#F0F0F2]"} ${className}`}>
      {children}
    </div>
  );
}
