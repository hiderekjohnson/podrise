import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "wouter";

interface HoverPreviewCardProps {
  type: "podcast" | "person" | "company";
  slug: string;
  name: string;
  artworkUrl?: string;
  description?: string;
  episodeCount?: number;
  title?: string;
  bio?: string;
  isFollowing?: boolean;
  onFollowToggle?: (slug: string, follow: boolean) => void;
  children: React.ReactNode;
}

function isMobile() {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

export function HoverPreviewCard({
  type,
  slug,
  name,
  artworkUrl,
  description,
  episodeCount,
  title,
  bio,
  isFollowing,
  onFollowToggle,
  children,
}: HoverPreviewCardProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const showCard = useCallback(() => {
    if (isMobile()) return;
    timerRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const cardHeight = 200;
        let top = rect.bottom + 8;
        if (top + cardHeight > viewportHeight) {
          top = rect.top - cardHeight - 8;
        }
        let left = rect.left;
        if (left + 320 > window.innerWidth) {
          left = window.innerWidth - 330;
        }
        setPosition({ top, left });
      }
      setVisible(true);
    }, 300);
  }, []);

  const hideCard = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setTimeout(() => {
      if (!cardRef.current?.matches(":hover") && !triggerRef.current?.matches(":hover")) {
        setVisible(false);
      }
    }, 100);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const detailPath = type === "podcast" ? `/podcasts/${slug}` : type === "person" ? `/people/${slug}` : `/companies/${slug}`;

  const cardContent = type === "podcast" ? (
    <div>
      <div className="flex gap-3">
        {artworkUrl && (
          <Link href={detailPath}>
            <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 ring-[0.5px] ring-black/5">
              <img src={artworkUrl} alt={name} className="w-full h-full object-cover" />
            </div>
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <Link href={detailPath}>
            <p className="text-[15px] font-bold text-[#09090B] dark:text-white truncate hover:underline">{name}</p>
          </Link>
          {description && (
            <p className="text-[13px] text-[#52525B] dark:text-[#A1A1AA] mt-1 line-clamp-2 leading-relaxed">{description}</p>
          )}
        </div>
      </div>
      {onFollowToggle && (
        <button
          onClick={(e) => { e.stopPropagation(); onFollowToggle(slug, !isFollowing); }}
          className={`mt-3 w-full text-[13px] font-bold rounded-full py-1.5 transition-all active:scale-95 ${
            isFollowing
              ? "border border-[#D4D4D8] dark:border-[#3F3F46] text-[#09090B] dark:text-white hover:border-red-300 hover:text-red-600"
              : "bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] hover:bg-[#27272A] dark:hover:bg-[#E4E4E7]"
          }`}
          data-testid={`hover-follow-${slug}`}
        >
          {isFollowing ? "Following" : "Follow"}
        </button>
      )}
    </div>
  ) : type === "person" ? (
    <Link href={detailPath}>
      <div className="flex gap-3">
        {artworkUrl && (
          <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0">
            <img src={artworkUrl} alt={name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-[#09090B] dark:text-white hover:underline">{name}</p>
          {title && <p className="text-[13px] text-[#6366F1] mt-0.5">{title}</p>}
          {bio && <p className="text-[13px] text-[#52525B] dark:text-[#A1A1AA] mt-1 line-clamp-2 leading-relaxed">{bio}</p>}
        </div>
      </div>
    </Link>
  ) : (
    <Link href={detailPath}>
      <div className="flex gap-3">
        {artworkUrl && (
          <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
            <img src={artworkUrl} alt={name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-[#09090B] dark:text-white hover:underline">{name}</p>
          {description && <p className="text-[13px] text-[#52525B] dark:text-[#A1A1AA] mt-1 line-clamp-2 leading-relaxed">{description}</p>}
        </div>
      </div>
    </Link>
  );

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showCard}
        onMouseLeave={hideCard}
        className="inline-block"
      >
        {children}
      </div>
      {visible && (
        <div
          ref={cardRef}
          onMouseEnter={() => setVisible(true)}
          onMouseLeave={hideCard}
          className="fixed z-[100] w-[300px] bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-2xl shadow-xl p-4 animate-in fade-in-0 zoom-in-95 duration-150"
          style={{ top: position.top, left: position.left }}
          data-testid={`hover-card-${type}-${slug}`}
        >
          {cardContent}
        </div>
      )}
    </>
  );
}
