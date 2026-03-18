import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageCircle, Bookmark, BookmarkCheck, Share, ChevronDown, Copy, ExternalLink, Gift, ChevronRight, MoreHorizontal, Users, Building2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/DashboardLayout";
import { FeatureTour } from "@/components/FeatureTour";
import { FeedEpisodeCard } from "@/components/FeedEpisodeCard";
import { PEOPLE_DIRECTORY, COMPANIES_DIRECTORY } from "@/data/entityDirectoryData";

const PEOPLE_IMAGE_MAP = new Map<string, string>();
PEOPLE_DIRECTORY.forEach(p => {
  PEOPLE_IMAGE_MAP.set(p.slug, p.imageUrl);
  PEOPLE_IMAGE_MAP.set(p.name.toLowerCase(), p.imageUrl);
});

const COMPANY_LOGO_MAP = new Map<string, string>();
COMPANIES_DIRECTORY.forEach(c => {
  COMPANY_LOGO_MAP.set(c.slug, c.logoUrl);
  COMPANY_LOGO_MAP.set(c.name.toLowerCase(), c.logoUrl);
});

interface MentionEntry {
  slug: string;
  name: string;
  role: string | null;
  company: string | null;
  context: string | null;
}

interface ProductEntry {
  name: string;
  company: string | null;
  description: string | null;
  imageUrl: string | null;
  category: string;
  purchaseUrl: string | null;
}

interface FeedItem {
  id: number;
  podcastSlug: string;
  podcastName: string;
  episodeTitle: string;
  episodeSlug: string;
  publishDate: string;
  artworkUrl: string;
  tldl: string;
  whatHappened: string | null;
  keyInsights: string[] | null;
  quote: string | null;
  quoteAttribution: string | null;
  duration: string | null;
  guests: string[];
  keyTopics: string[];
  isFollowing: boolean;
  tabloidSubHeadline: string | null;
  hosts: string | null;
  totalEpisodes: number | null;
  yearStarted: number | null;
  appleUrl: string | null;
  spotifyUrl: string | null;
  youtubeUrl: string | null;
  spotifyEpisodeUrl: string | null;
  appleEpisodeUrl: string | null;
  mentions: {
    people: MentionEntry[];
    companies: MentionEntry[];
    products: ProductEntry[];
  };
}

function relativeTime(dateStr: string): string {
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

function hiResArtwork(url: string): string {
  if (!url) return "";
  if (url.startsWith("/artwork/")) return url;
  return url.replace(/\/\d+x\d+bb\./, "/100x100bb.");
}

const AVATAR_COLORS = [
  { bg: "#EEF2FF", color: "#4F46E5" },
  { bg: "#F0F9FF", color: "#0369A1" },
  { bg: "#FFF7ED", color: "#C2410C" },
  { bg: "#FEF9C3", color: "#A16207" },
  { bg: "#FCE7F3", color: "#9D174D" },
  { bg: "#F0FDF4", color: "#15803D" },
  { bg: "#E0E7FF", color: "#3730A3" },
  { bg: "#FEF2F2", color: "#DC2626" },
];

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function getAvatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function getHeaderTint(artworkUrl: string): string {
  const hash = artworkUrl ? artworkUrl.split("").reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  const tints = ["#F0F1FE", "#FFFBEB", "#FEF2F2", "#ECFDF5", "#F0F9FF", "#FDF4FF", "#FFF7ED", "#F5F3FF"];
  return tints[hash % tints.length];
}

function PodSquadBanner() {
  const [, navigate] = useLocation();

  return (
    <div className="md:hidden px-4 py-3" data-testid="pod-squad-banner">
      <button
        onClick={() => navigate("/pod-squad")}
        className="w-full relative overflow-hidden rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
        style={{ background: "linear-gradient(135deg, #6366F1 0%, #7C3AED 50%, #A855F7 100%)" }}
        data-testid="pod-squad-banner-cta"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Gift className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-[15px] leading-tight">Invite Friends, Earn Rewards</div>
            <div className="text-white/80 text-[13px] mt-0.5">Get stickers, t-shirts, AirPods & more</div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/70 flex-shrink-0" />
        </div>
      </button>
    </div>
  );
}

function SharePopover({ episodeTitle, podcastSlug, episodeSlug, itemId, toast }: {
  episodeTitle: string;
  podcastSlug: string;
  episodeSlug: string;
  itemId: number;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const getShareUrl = () => `${window.location.origin}/podcasts/${encodeURIComponent(podcastSlug)}/${encodeURIComponent(episodeSlug)}`;
  const supportsNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("keydown", handleKeyDown); };
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Share episode"
        className="w-10 h-10 rounded-[7px] flex items-center justify-center text-[#A1A1AA] hover:bg-white hover:text-[#6366F1] transition-all"
        data-testid={`feed-share-${itemId}`}
      >
        <Share className="w-4 h-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 mb-2 w-[180px] bg-white rounded-xl shadow-lg border border-[#E4E4E7] overflow-hidden z-50"
          >
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(getShareUrl());
                  toast({ title: "Link copied", description: "Episode link copied to clipboard" });
                } catch { toast({ title: "Copy failed", description: "Could not copy link", variant: "destructive" }); }
                setOpen(false);
              }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-[13px] font-medium text-[#3F3F46] hover:bg-[#F4F4F5] transition-colors"
              data-testid={`feed-share-copy-${itemId}`}
            >
              <Copy className="w-4 h-4" /> Copy link
            </button>
            {supportsNativeShare && (
              <button
                onClick={() => { navigator.share({ title: episodeTitle, url: getShareUrl() }).catch(() => {}); setOpen(false); }}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-[13px] font-medium text-[#3F3F46] hover:bg-[#F4F4F5] border-t border-[#F0F0F2]"
                data-testid={`feed-share-native-${itemId}`}
              >
                <ExternalLink className="w-4 h-4" /> Share via...
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MentionAvatar({ src, name, index, kind }: { src: string; name: string; index: number; kind: "person" | "company" }) {
  const [failed, setFailed] = useState(!src);
  if (failed) {
    const colors = getAvatarColor(index);
    return (
      <div
        className={`w-[42px] h-[42px] flex-shrink-0 flex items-center justify-center text-[13px] font-bold ${kind === "person" ? "rounded-full" : "rounded-[10px]"}`}
        style={{ background: colors.bg, color: colors.color }}
      >
        {getInitials(name)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      className={`w-[42px] h-[42px] flex-shrink-0 object-cover ${kind === "person" ? "rounded-full" : "rounded-[10px] bg-white border border-[#F0F0F2]"}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function parseSpotifyEpisodeId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/open\.spotify\.com\/episode\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function parseYouTubeVideoId(url: string | null): string | null {
  if (!url) return null;
  if (url.includes("/search") || url.includes("search_query")) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/>
      <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="white"/>
    </svg>
  );
}

function RecapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  );
}

function ListenSection({ item }: { item: FeedItem }) {
  const spotifyId = parseSpotifyEpisodeId(item.spotifyEpisodeUrl);
  const youtubeId = parseYouTubeVideoId(item.youtubeUrl);
  const spotifyFallbackUrl = item.spotifyEpisodeUrl || item.spotifyUrl;
  const hasSpotifyEmbed = !!spotifyId;
  const hasSpotifyLink = !!spotifyFallbackUrl;
  const hasYoutubeEmbed = !!youtubeId;
  const hasYoutubeLink = !!item.youtubeUrl && item.youtubeUrl !== '';

  if (!hasSpotifyEmbed && !hasSpotifyLink && !hasYoutubeEmbed && !hasYoutubeLink) return null;

  return (
    <div className="px-5 py-4 flex flex-col gap-3">
      {hasSpotifyEmbed && (
        <iframe
          src={`https://open.spotify.com/embed/episode/${spotifyId}?utm_source=generator&theme=0`}
          width="100%"
          height="152"
          frameBorder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="rounded-xl"
          data-testid={`listen-spotify-embed-${item.id}`}
        />
      )}
      {!hasSpotifyEmbed && hasSpotifyLink && (
        <a
          href={spotifyFallbackUrl!}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#1DB954]/[0.08] text-[#1DB954] hover:bg-[#1DB954]/[0.14] transition-colors"
          data-testid={`listen-spotify-link-${item.id}`}
        >
          <SpotifyIcon className="w-5 h-5" />
          <span className="text-[14px] font-semibold">Listen on Spotify</span>
          <ExternalLink className="w-3.5 h-3.5 ml-auto" />
        </a>
      )}
      {hasYoutubeEmbed && (
        <div className="relative w-full rounded-xl overflow-hidden" style={{ paddingBottom: '56.25%' }}>
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}`}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            className="absolute inset-0 w-full h-full"
            data-testid={`listen-youtube-embed-${item.id}`}
          />
        </div>
      )}
      {!hasYoutubeEmbed && hasYoutubeLink && (
        <a
          href={item.youtubeUrl!}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#FF0000]/[0.08] text-[#FF0000] hover:bg-[#FF0000]/[0.14] transition-colors"
          data-testid={`listen-youtube-link-${item.id}`}
        >
          <YouTubeIcon className="w-5 h-5" />
          <span className="text-[14px] font-semibold">Watch on YouTube</span>
          <ExternalLink className="w-3.5 h-3.5 ml-auto" />
        </a>
      )}
    </div>
  );
}

function CardBottomAccordion({ item, isBookmarked, onBookmarkToggle, onFollowToggle, toast }: {
  item: FeedItem;
  isBookmarked: boolean;
  onBookmarkToggle: (episodeSlug: string, podcastSlug: string) => void;
  onFollowToggle: (slug: string, follow: boolean) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [openSection, setOpenSection] = useState<"recap" | "mentions" | "listen" | null>(null);
  const [activeTab, setActiveTab] = useState<"people" | "companies" | "products">("people");
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [showAllProducts, setShowAllProducts] = useState(false);

  const { people, companies, products } = item.mentions;
  const totalMentions = people.length + companies.length + products.length;
  const whatHappenedParagraphs = item.whatHappened ? item.whatHappened.split(/\n\n+/).filter((p) => p.trim()) : [];
  const hasRecap = whatHappenedParagraphs.length > 0;
  const hasMentions = totalMentions > 0;

  const spotifyId = parseSpotifyEpisodeId(item.spotifyEpisodeUrl);
  const youtubeId = parseYouTubeVideoId(item.youtubeUrl);
  const hasListen = !!spotifyId || !!youtubeId || !!item.spotifyEpisodeUrl || !!item.spotifyUrl || (!!item.youtubeUrl && item.youtubeUrl !== '');

  const toggleSection = (section: "recap" | "mentions" | "listen") => {
    setOpenSection(prev => prev === section ? null : section);
  };

  const stackItems = [...people.slice(0, 3), ...companies.slice(0, 2)];
  const remaining = totalMentions - stackItems.length;

  const tabs: { key: "people" | "companies" | "products"; label: string; count: number }[] = [];
  if (people.length > 0) tabs.push({ key: "people", label: "People", count: people.length });
  if (companies.length > 0) tabs.push({ key: "companies", label: "Companies", count: companies.length });
  if (products.length > 0) tabs.push({ key: "products", label: "Products", count: products.length });

  useEffect(() => {
    if (!tabs.find(t => t.key === activeTab) && tabs.length > 0) {
      setActiveTab(tabs[0].key);
    }
  }, [people.length, companies.length, products.length, activeTab]);

  const renderMentionRows = (items: MentionEntry[], type: "person" | "company", showAll: boolean, onShowMore: () => void) => {
    const visibleItems = showAll ? items : items.slice(0, 3);
    const hiddenCount = items.length - 3;
    return (
      <>
        {visibleItems.map((m, i) => {
          const personImg = type === "person" ? (PEOPLE_IMAGE_MAP.get(m.slug) || PEOPLE_IMAGE_MAP.get(m.name.toLowerCase())) : null;
          const companyImg = type === "company" ? (COMPANY_LOGO_MAP.get(m.slug) || COMPANY_LOGO_MAP.get(m.name.toLowerCase())) : null;
          return (
          <div key={m.slug + i} className="flex items-start gap-[14px] py-[15px] border-b border-[#F0F0F2] last:border-b-0" data-testid={`mention-${type}-${m.slug}`}>
            <MentionAvatar
              src={type === "person" ? (personImg || "/people/default-avatar.png") : (companyImg || "")}
              name={m.name}
              index={i}
              kind={type === "person" ? "person" : "company"}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap mb-1">
                <span className="text-[15px] font-bold text-[#09090B]">{m.name}</span>
                {(m.role || m.company) && (
                  <span className="text-[12px] text-[#71717A]">
                    {m.role}{m.company ? ` at ${m.company}` : ""}
                  </span>
                )}
              </div>
              {m.context && <div className="text-[14px] text-[#52525B] leading-[1.55]">{m.context}</div>}
            </div>
          </div>
          );
        })}
        {!showAll && hiddenCount > 0 && (
          <div className="py-3 flex justify-center">
            <button onClick={onShowMore} className="text-[14px] font-medium text-[#6366F1] bg-transparent border-[1.5px] border-[#A5B4FC] rounded-full px-[18px] py-[7px] hover:bg-[#EEF2FF] hover:border-[#6366F1] transition-all" data-testid={`mention-show-more-${type}`}>
              Show {hiddenCount} more {type === "person" ? "people" : "companies"}
            </button>
          </div>
        )}
      </>
    );
  };

  const renderProductRows = (items: ProductEntry[], showAll: boolean, onShowMore: () => void) => {
    const visibleItems = showAll ? items : items.slice(0, 3);
    const hiddenCount = items.length - 3;
    return (
      <>
        {visibleItems.map((p, i) => (
          <div key={p.name + i} className="flex items-start gap-[14px] py-[15px] border-b border-[#F0F0F2] last:border-b-0" data-testid={`mention-product-${i}`}>
            <div className="w-[34px] h-[46px] rounded flex-shrink-0 bg-[#EEF2FF] flex items-center justify-center text-[18px] shadow-[2px_2px_0_rgba(0,0,0,0.08)]">
              📘
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold text-[#09090B] mb-1">{p.name}</div>
              {p.company && <div className="text-[12px] text-[#A1A1AA] mb-[5px]" style={{ fontFamily: "var(--font-mono)" }}>{p.company}</div>}
              {p.description && <div className="text-[14px] text-[#52525B] leading-[1.55]">{p.description}</div>}
            </div>
          </div>
        ))}
        {!showAll && hiddenCount > 0 && (
          <div className="py-3 flex justify-center">
            <button onClick={onShowMore} className="text-[14px] font-medium text-[#6366F1] bg-transparent border-[1.5px] border-[#A5B4FC] rounded-full px-[18px] py-[7px] hover:bg-[#EEF2FF] hover:border-[#6366F1] transition-all" data-testid="mention-show-more-products">
              Show {hiddenCount} more products
            </button>
          </div>
        )}
      </>
    );
  };

  return (
    <div data-testid={`feed-accordion-${item.id}`}>
      {hasRecap && (
        <div className="border-t border-[#E4E4E7]" data-testid={`feed-recap-section-${item.id}`}>
          <div
            className={`flex items-center gap-3 px-4 md:px-5 py-[13px] cursor-pointer transition-colors ${openSection === "recap" ? "bg-[#F7F7FC]" : "hover:bg-[#FAFAFB]"}`}
            onClick={() => toggleSection("recap")}
            data-testid={`feed-recap-toggle-${item.id}`}
          >
            <div className="flex items-center flex-shrink-0">
              <RecapIcon className="w-[22px] h-[22px] text-[#6366F1]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-[#09090B]">Episode Recap</div>
            </div>
            <ChevronDown className={`w-4 h-4 text-[#A1A1AA] flex-shrink-0 transition-transform duration-200 ${openSection === "recap" ? "rotate-180 text-[#6366F1]" : ""}`} />
          </div>
          <AnimatePresence>
            {openSection === "recap" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="px-5 md:px-6 py-4 border-t border-[#F0F0F2]">
                  <div className="text-[16px] text-[#52525B] leading-[1.8]" data-testid={`feed-recap-${item.id}`}>
                    {whatHappenedParagraphs.map((para, i) => (
                      <p key={i} className="mb-[14px] last:mb-0">{para}</p>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {hasMentions && (
        <div className="border-t border-[#E4E4E7]" data-testid={`feed-mentions-${item.id}`}>
          <div
            className={`flex items-center gap-3 px-4 md:px-5 py-[13px] cursor-pointer transition-colors ${openSection === "mentions" ? "bg-[#F7F7FC]" : "hover:bg-[#FAFAFB]"}`}
            onClick={() => toggleSection("mentions")}
            data-testid={`feed-mentions-toggle-${item.id}`}
          >
            <div className="flex items-center flex-shrink-0">
              {stackItems.map((m, i) => {
                const isPerson = i < people.length;
                const personImg = isPerson ? (PEOPLE_IMAGE_MAP.get(m.slug) || PEOPLE_IMAGE_MAP.get(m.name.toLowerCase())) : null;
                const companyImg = !isPerson ? (COMPANY_LOGO_MAP.get(m.slug) || COMPANY_LOGO_MAP.get(m.name.toLowerCase())) : null;
                const borderColor = openSection === "mentions" ? "#F7F7FC" : "#FFFFFF";
                if (isPerson && personImg) {
                  return <img key={m.slug + i} src={personImg} alt={m.name} className={`w-[28px] h-[28px] rounded-full flex-shrink-0 object-cover ${i > 0 ? "-ml-[8px]" : ""}`} style={{ border: `2px solid ${borderColor}` }} loading="lazy" />;
                }
                if (!isPerson && companyImg) {
                  return <img key={m.slug + i} src={companyImg} alt={m.name} className={`w-[28px] h-[28px] rounded-lg flex-shrink-0 object-cover bg-white ${i > 0 ? "-ml-[8px]" : ""}`} style={{ border: `2px solid ${borderColor}` }} loading="lazy" />;
                }
                const colors = getAvatarColor(i);
                return (
                  <div
                    key={m.slug + i}
                    className={`w-[28px] h-[28px] flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${i > 0 ? "-ml-[8px]" : ""} ${
                      isPerson ? "rounded-full" : "rounded-lg"
                    }`}
                    style={{ background: colors.bg, color: colors.color, border: `2px solid ${borderColor}` }}
                  >
                    {getInitials(m.name)}
                  </div>
                );
              })}
              {remaining > 0 && (
                <div className="w-[28px] h-[28px] rounded-full flex-shrink-0 -ml-[8px] bg-[#E4E4E7] text-[#71717A] text-[9px] font-bold flex items-center justify-center" style={{ fontFamily: "var(--font-mono)", border: `2px solid ${openSection === "mentions" ? "#F7F7FC" : "#FFFFFF"}` }}>
                  +{remaining}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-[#09090B]">Mentioned in this episode</div>
            </div>
            <ChevronDown className={`w-4 h-4 text-[#A1A1AA] flex-shrink-0 transition-transform duration-200 ${openSection === "mentions" ? "rotate-180 text-[#6366F1]" : ""}`} />
          </div>
          <AnimatePresence>
            {openSection === "mentions" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden border-t border-[#F0F0F2]"
              >
                <div className="flex border-b border-[#F0F0F2] px-6">
                  {tabs.map((tab, i) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-[6px] py-[11px] px-[14px] text-[14px] font-medium border-b-2 -mb-px transition-colors select-none whitespace-nowrap ${
                        i === 0 ? "pl-0" : ""
                      } ${
                        activeTab === tab.key
                          ? "text-[#6366F1] border-[#6366F1] font-semibold"
                          : "text-[#A1A1AA] border-transparent hover:text-[#52525B]"
                      }`}
                      data-testid={`mention-tab-${tab.key}-${item.id}`}
                    >
                      {tab.label}
                      <span className={`text-[11px] font-semibold px-[7px] py-[1px] rounded-full transition-all ${
                        activeTab === tab.key ? "bg-[#EEF2FF] text-[#6366F1]" : "bg-[#F0F0F2] text-[#71717A]"
                      }`} style={{ fontFamily: "var(--font-mono)" }}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="px-6 pb-1">
                  {activeTab === "people" && renderMentionRows(people, "person", showAllPeople, () => setShowAllPeople(true))}
                  {activeTab === "companies" && renderMentionRows(companies, "company", showAllCompanies, () => setShowAllCompanies(true))}
                  {activeTab === "products" && renderProductRows(products, showAllProducts, () => setShowAllProducts(true))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {hasListen && (
        <div className="border-t border-[#E4E4E7]" data-testid={`feed-listen-section-${item.id}`}>
          <div
            className={`flex items-center gap-3 px-4 md:px-5 py-[13px] cursor-pointer transition-colors ${openSection === "listen" ? "bg-[#F7F7FC]" : "hover:bg-[#FAFAFB]"}`}
            onClick={() => toggleSection("listen")}
            data-testid={`feed-listen-toggle-${item.id}`}
          >
            <div className="flex items-center flex-shrink-0">
              <SpotifyIcon className="w-[22px] h-[22px] text-[#1DB954]" />
              {youtubeId && <YouTubeIcon className="w-[22px] h-[22px] text-[#FF0000] -ml-[4px]" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-[#09090B]">Listen to this episode</div>
            </div>
            <ChevronDown className={`w-4 h-4 text-[#A1A1AA] flex-shrink-0 transition-transform duration-200 ${openSection === "listen" ? "rotate-180 text-[#6366F1]" : ""}`} />
          </div>
          <AnimatePresence>
            {openSection === "listen" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden border-t border-[#F0F0F2]"
              >
                <ListenSection item={item} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="border-t border-[#E4E4E7] flex items-center justify-end px-3 md:px-4 py-2">
        <div className="flex items-center gap-[2px]">
          <button
            onClick={() => onBookmarkToggle(item.episodeSlug, item.podcastSlug)}
            className={`w-8 h-8 rounded-[7px] flex items-center justify-center transition-all ${isBookmarked ? "text-[#6366F1]" : "text-[#A1A1AA] hover:bg-[#F4F4F5] hover:text-[#6366F1]"}`}
            data-testid={`feed-bookmark-${item.id}`}
          >
            {isBookmarked ? <BookmarkCheck className="w-[15px] h-[15px]" /> : <Bookmark className="w-[15px] h-[15px]" />}
          </button>
          <SharePopover episodeTitle={item.episodeTitle} podcastSlug={item.podcastSlug} episodeSlug={item.episodeSlug} itemId={item.id} toast={toast} />
          <button
            onClick={() => onFollowToggle(item.podcastSlug, !item.isFollowing)}
            className={`ml-2 px-4 py-[6px] rounded-full text-[13px] font-bold transition-all whitespace-nowrap ${
              item.isFollowing
                ? "bg-white text-[#52525B] border-[1.5px] border-[#E4E4E7] hover:border-[#6366F1] hover:text-[#6366F1]"
                : "bg-[#6366F1] text-white hover:bg-[#4F46E5]"
            }`}
            data-testid={`feed-mentions-follow-${item.id}`}
          >
            {item.isFollowing ? "Following" : "Follow"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FollowMenuDropdown({ onUnfollow, itemId }: { onUnfollow: () => void; itemId: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("keydown", handleKeyDown); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-11 h-11 rounded-full flex items-center justify-center border border-[#D4D4D8] text-[#71717A] hover:text-[#6366F1] hover:border-[#6366F1]/30 transition-all bg-white"
        aria-label="Podcast options"
        data-testid={`feed-follow-menu-${itemId}`}
      >
        <MoreHorizontal className="w-[18px] h-[18px]" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-1 w-[160px] bg-white rounded-xl shadow-lg border border-[#E4E4E7] overflow-hidden z-50"
          >
            <button
              onClick={() => { onUnfollow(); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3.5 py-2.5 text-[13px] font-medium text-[#EF4444] hover:bg-[#FEF2F2] transition-colors"
              data-testid={`feed-unfollow-btn-${itemId}`}
            >
              Unfollow
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RecapCard({ item, onFollowToggle, bookmarkedKeys, onBookmarkToggle, toast }: {
  item: FeedItem;
  onFollowToggle: (slug: string, follow: boolean) => void;
  bookmarkedKeys: Set<string>;
  onBookmarkToggle: (episodeSlug: string, podcastSlug: string) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const isBookmarked = bookmarkedKeys.has(`${item.podcastSlug}::${item.episodeSlug}`);

  const followAction = item.isFollowing ? (
    <FollowMenuDropdown onUnfollow={() => onFollowToggle(item.podcastSlug, false)} itemId={item.id} />
  ) : (
    <button
      onClick={() => onFollowToggle(item.podcastSlug, true)}
      className="inline-flex items-center px-5 py-[9px] rounded-full text-[14px] font-bold transition-all bg-[#6366F1] text-white hover:bg-[#4F46E5]"
      data-testid={`feed-follow-btn-${item.id}`}
    >
      Follow
    </button>
  );

  return (
    <div className="mb-5" data-testid={`feed-card-${item.id}`}>
      <FeedEpisodeCard
        podcastSlug={item.podcastSlug}
        episodeSlug={item.episodeSlug}
        podcastName={item.podcastName}
        episodeTitle={item.episodeTitle}
        publishDate={item.publishDate}
        artworkUrl={item.artworkUrl}
        tldl={item.tabloidSubHeadline || item.tldl}
        keyInsights={item.keyInsights}
        quote={item.quote}
        quoteAttribution={item.quoteAttribution}
        hosts={item.hosts || undefined}
        totalEpisodes={item.totalEpisodes || undefined}
        yearStarted={item.yearStarted || undefined}
        testIdPrefix="feed-card"
        headerAction={followAction}
        bottomActions={
          <CardBottomAccordion
            item={item}
            isBookmarked={isBookmarked}
            onBookmarkToggle={onBookmarkToggle}
            onFollowToggle={onFollowToggle}
            toast={toast}
          />
        }
      />
    </div>
  );
}

interface FeedAdData {
  id: number;
  type: "podcast" | "regular" | "episode_recap";
  title: string;
  description: string;
  imageUrl: string;
  destinationUrl: string;
  podcastSlug: string | null;
  episodeSlug: string | null;
  episodeTitle: string | null;
  episodeTldl: string | null;
  episodeKeyInsights: string[] | null;
  episodeQuote: string | null;
  episodeQuoteAttribution: string | null;
  podcastName: string | null;
  weight: number;
  isActive: boolean;
}

function trackAdEvent(adId: number, eventType: "view" | "click" | "follow") {
  fetch("/api/ad-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adId, eventType }),
  }).catch(() => {});
}

function useAdViewTracking(adId: number) {
  const ref = useRef<HTMLDivElement>(null);
  const tracked = useRef(false);
  useEffect(() => {
    if (!ref.current || tracked.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !tracked.current) {
          tracked.current = true;
          trackAdEvent(adId, "view");
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [adId]);
  return ref;
}

function PodcastAdCard({ ad, onFollow }: { ad: FeedAdData; onFollow: (slug: string, adId?: number) => void }) {
  const viewRef = useAdViewTracking(ad.id);
  return (
    <div
      ref={viewRef}
      className="rounded-2xl overflow-hidden mb-4"
      style={{ background: "#FDF8F3" }}
      data-testid={`feed-podcast-ad-${ad.id}`}
    >
      <div className="p-5 flex items-start gap-4">
        <Link
          href={ad.podcastSlug ? `/podcasts/${ad.podcastSlug}` : (ad.destinationUrl || "#")}
          onClick={() => trackAdEvent(ad.id, "click")}
          className="flex items-start gap-4 flex-1 min-w-0 no-underline"
          data-testid={`feed-podcast-ad-link-${ad.id}`}
        >
          <img
            src={ad.imageUrl}
            alt={ad.title}
            className="w-[72px] h-[72px] rounded-xl object-cover shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.background = "#ddd"; }}
          />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[17px] text-[#09090B] mb-1" data-testid={`text-podcast-ad-title-${ad.id}`}>
              {ad.title}
            </div>
            <div className="text-[14px] text-[#52525B] leading-[1.6]" data-testid={`text-podcast-ad-desc-${ad.id}`}>
              {ad.description}
            </div>
          </div>
        </Link>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-[12px] text-[#A1A1AA] font-medium" data-testid={`label-ad-${ad.id}`}>Ad</span>
          {ad.podcastSlug && (
            <button
              onClick={() => onFollow(ad.podcastSlug!, ad.id)}
              className="inline-flex items-center px-5 py-[7px] rounded-full text-[14px] font-bold transition-all bg-[#6366F1] text-white hover:bg-[#4F46E5]"
              data-testid={`feed-ad-follow-btn-${ad.id}`}
            >
              Follow
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RegularAdCard({ ad }: { ad: FeedAdData }) {
  const viewRef = useAdViewTracking(ad.id);
  return (
    <div
      ref={viewRef}
      className="rounded-2xl overflow-hidden mb-4"
      style={{ background: "#FDF8F3" }}
      data-testid={`feed-regular-ad-${ad.id}`}
    >
      <div className="p-5 flex items-start gap-4">
        <img
          src={ad.imageUrl}
          alt={ad.title}
          className="w-[72px] h-[72px] rounded-xl object-cover shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.background = "#ddd"; }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[17px] text-[#09090B] mb-1" data-testid={`text-regular-ad-title-${ad.id}`}>
            {ad.title}
          </div>
          <div className="text-[14px] text-[#52525B] leading-[1.6] [&_a]:text-[#6366F1] [&_a]:underline [&_a]:hover:text-[#4F46E5]" data-testid={`text-regular-ad-desc-${ad.id}`}>
            <span dangerouslySetInnerHTML={{ __html: ad.description }} />
            {ad.destinationUrl && (() => {
              try {
                const hostname = new URL(ad.destinationUrl).hostname.replace("www.", "");
                return (
                  <>
                    {" "}
                    <a
                      href={ad.destinationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#6366F1] underline hover:text-[#4F46E5]"
                      data-testid={`link-regular-ad-${ad.id}`}
                      onClick={() => trackAdEvent(ad.id, "click")}
                    >
                      {hostname}
                    </a>
                  </>
                );
              } catch { return null; }
            })()}
          </div>
        </div>
        <div className="shrink-0">
          <span className="text-[12px] text-[#A1A1AA] font-medium" data-testid={`label-ad-${ad.id}`}>Ad</span>
        </div>
      </div>
    </div>
  );
}

function EpisodeRecapAdCard({ ad, onFollow }: { ad: FeedAdData; onFollow: (slug: string, adId?: number) => void }) {
  const viewRef = useAdViewTracking(ad.id);
  const insights = ad.episodeKeyInsights || [];
  return (
    <div
      ref={viewRef}
      className="rounded-2xl overflow-hidden mb-4"
      style={{ background: "#FDF8F3" }}
      data-testid={`feed-episode-recap-ad-${ad.id}`}
    >
      <div className="p-5">
        <div className="flex items-start gap-4 mb-3">
          <img
            src={ad.imageUrl}
            alt={ad.podcastName || ad.title}
            className="w-[72px] h-[72px] rounded-xl object-cover shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.background = "#ddd"; }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] text-[#A1A1AA] font-medium mb-0.5" data-testid={`text-recap-ad-podcast-${ad.id}`}>
                  {ad.podcastName || ad.title}
                </div>
                <div className="font-bold text-[16px] text-[#09090B] leading-tight" data-testid={`text-recap-ad-episode-${ad.id}`}>
                  {ad.episodeTitle || ad.title}
                </div>
              </div>
              <span className="text-[12px] text-[#A1A1AA] font-medium shrink-0 ml-2" data-testid={`label-ad-${ad.id}`}>Ad</span>
            </div>
          </div>
        </div>

        {ad.episodeTldl && (
          <div className="mb-3">
            <div className="text-[11px] font-bold text-[#6366F1] uppercase tracking-wide mb-1">TL;DL</div>
            <div className="text-[14px] text-[#52525B] leading-[1.6]" data-testid={`text-recap-ad-tldl-${ad.id}`}>
              {ad.episodeTldl}
            </div>
          </div>
        )}

        {insights.length > 0 && (
          <div className="mb-3">
            <div className="text-[11px] font-bold text-[#6366F1] uppercase tracking-wide mb-1">Key Insights</div>
            <ul className="space-y-1">
              {insights.slice(0, 3).map((insight, i) => (
                <li key={i} className="text-[13px] text-[#52525B] leading-[1.5] flex items-start gap-2">
                  <span className="text-[#6366F1] mt-0.5 shrink-0">•</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {ad.episodeQuote && (
          <div className="mb-3 pl-3 border-l-2 border-[#6366F1]/30">
            <div className="text-[13px] text-[#52525B] italic leading-[1.5]" data-testid={`text-recap-ad-quote-${ad.id}`}>
              "{ad.episodeQuote}"
            </div>
            {ad.episodeQuoteAttribution && (
              <div className="text-[12px] text-[#A1A1AA] mt-1">— {ad.episodeQuoteAttribution}</div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-black/[0.06]">
          {ad.podcastSlug && ad.episodeSlug ? (
            <Link
              href={`/podcasts/${ad.podcastSlug}/${ad.episodeSlug}`}
              className="text-[13px] font-bold text-[#6366F1] hover:text-[#4F46E5]"
              onClick={() => trackAdEvent(ad.id, "click")}
              data-testid={`link-recap-ad-${ad.id}`}
            >
              Read Full Recap →
            </Link>
          ) : <div />}
          {ad.podcastSlug && (
            <button
              onClick={() => onFollow(ad.podcastSlug!, ad.id)}
              className="inline-flex items-center px-5 py-[7px] rounded-full text-[14px] font-bold transition-all bg-[#6366F1] text-white hover:bg-[#4F46E5]"
              data-testid={`feed-ad-follow-btn-${ad.id}`}
            >
              Follow
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FeedPage() {
  const { data: user } = useAuth();
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), [location]);
  const isWelcome = urlParams.get("welcome") === "true";
  const podcastFilter = urlParams.get("podcast") || "";
  const tabParam = urlParams.get("tab");
  const initialTab = tabParam === "following" || isWelcome ? "following" : "foryou";
  const [activeTab, setActiveTab] = useState<"foryou" | "following">(initialTab);
  const observerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tabParam === "following") setActiveTab("following");
    else if (tabParam === "foryou") setActiveTab("foryou");
  }, [tabParam]);

  type BookmarkRecord = { id: number; episodeSlug: string; podcastSlug: string };

  const { data: bookmarksData } = useQuery<BookmarkRecord[]>({
    queryKey: ["/api/bookmarks"],
    enabled: !!user,
  });

  const bookmarkedKeys = new Set((bookmarksData || []).map((b) => `${b.podcastSlug}::${b.episodeSlug}`));

  const addBookmark = useMutation({
    mutationFn: async ({ episodeSlug, podcastSlug }: { episodeSlug: string; podcastSlug: string }) => {
      await apiRequest("POST", "/api/bookmarks", { episodeSlug, podcastSlug });
    },
    onMutate: async ({ episodeSlug, podcastSlug }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/bookmarks"] });
      const previous = queryClient.getQueryData<BookmarkRecord[]>(["/api/bookmarks"]);
      queryClient.setQueryData<BookmarkRecord[]>(["/api/bookmarks"], (old) => {
        const existing = old || [];
        if (existing.some((b) => b.podcastSlug === podcastSlug && b.episodeSlug === episodeSlug)) return existing;
        return [...existing, { id: Date.now(), episodeSlug, podcastSlug }];
      });
      return { previous };
    },
    onSuccess: () => { toast({ title: "Saved", description: "Episode saved" }); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] }); },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData<BookmarkRecord[]>(["/api/bookmarks"], context.previous);
      toast({ title: "Error", description: "Failed to save episode", variant: "destructive" });
    },
  });

  const removeBookmark = useMutation({
    mutationFn: async ({ podcastSlug, episodeSlug }: { podcastSlug: string; episodeSlug: string }) => {
      await apiRequest("DELETE", `/api/bookmarks/${encodeURIComponent(podcastSlug)}/${encodeURIComponent(episodeSlug)}`);
    },
    onMutate: async ({ podcastSlug, episodeSlug }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/bookmarks"] });
      const previous = queryClient.getQueryData<BookmarkRecord[]>(["/api/bookmarks"]);
      queryClient.setQueryData<BookmarkRecord[]>(["/api/bookmarks"], (old) =>
        (old || []).filter((b) => !(b.podcastSlug === podcastSlug && b.episodeSlug === episodeSlug))
      );
      return { previous };
    },
    onSuccess: () => { toast({ title: "Removed", description: "Episode removed from saved" }); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] }); },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData<BookmarkRecord[]>(["/api/bookmarks"], context.previous);
      toast({ title: "Error", description: "Failed to remove episode", variant: "destructive" });
    },
  });

  const handleBookmarkToggle = useCallback((episodeSlug: string, podcastSlug: string) => {
    if (!user) { toast({ title: "Sign in required", description: "Log in to save episodes", variant: "destructive" }); return; }
    const key = `${podcastSlug}::${episodeSlug}`;
    if (bookmarkedKeys.has(key)) removeBookmark.mutate({ podcastSlug, episodeSlug });
    else addBookmark.mutate({ episodeSlug, podcastSlug });
  }, [bookmarkedKeys, addBookmark, removeBookmark, user, toast]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["/api/feed", activeTab, podcastFilter],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ tab: activeTab, limit: "20" });
      if (pageParam) params.set("cursor", pageParam.toString());
      if (podcastFilter) params.set("podcast", podcastFilter);
      const res = await fetch(`/api/feed?${params}`);
      if (!res.ok) throw new Error("Failed to load feed");
      return res.json();
    },
    getNextPageParam: (lastPage: any) => lastPage.nextCursor,
    initialPageParam: null as number | null,
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { threshold: 0.1 }
    );
    if (observerRef.current) observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const followMutation = useMutation({
    mutationFn: async ({ podcastSlug, follow }: { podcastSlug: string; follow: boolean; adId?: number }) => {
      const endpoint = follow ? "/api/feed/follow" : "/api/feed/unfollow";
      const res = await apiRequest("POST", endpoint, { podcastSlug });
      return res.json();
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["/api/feed", activeTab, podcastFilter] });
      const previousFeed = queryClient.getQueryData(["/api/feed", activeTab, podcastFilter]);
      queryClient.setQueryData(["/api/feed", activeTab, podcastFilter], (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.map((item: any) =>
              item.podcastSlug === variables.podcastSlug
                ? { ...item, isFollowing: variables.follow }
                : item
            ),
          })),
        };
      });
      return { previousFeed };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sidebar-suggestions"] });
      if (variables.adId && variables.follow) {
        trackAdEvent(variables.adId, "follow");
      }
      toast({
        title: variables.follow ? "Following" : "Unfollowed",
        description: variables.follow ? "Added to your feed and daily email recap" : "Removed from your feed and daily email",
      });
    },
    onError: (_err, _vars, context) => {
      if (context?.previousFeed) {
        queryClient.setQueryData(["/api/feed", activeTab, podcastFilter], context.previousFeed);
      }
      toast({ title: "Error", description: "Failed to update subscription", variant: "destructive" });
    },
  });

  const handleFollowToggle = useCallback((slug: string, follow: boolean, adId?: number) => {
    if (!user) { toast({ title: "Sign in required", description: "Log in to follow podcasts", variant: "destructive" }); return; }
    followMutation.mutate({ podcastSlug: slug, follow, adId });
  }, [user, followMutation, toast]);

  const allItems: FeedItem[] = data?.pages?.flatMap((p: any) => p.items) || [];

  const { data: feedAdsData } = useQuery<{ ads: FeedAdData[]; frequency: number }>({
    queryKey: ["/api/feed-ads/batch"],
  });

  const feedAdsPool = feedAdsData?.ads || [];
  const adFrequency = feedAdsData?.frequency || 5;

  return (
    <DashboardLayout>
      <div className="min-h-screen flex flex-col" data-testid="feed-page">
        <div className="sticky top-0 z-30 flex-shrink-0 border-b border-[#F0F0F2] flex items-stretch h-[54px] pr-4" style={{ background: "rgba(255,255,255,0.94)", backdropFilter: "blur(16px)" }}>
          <div className="flex flex-1">
            {(["foryou", "following"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`feed-tab-btn flex-1 flex items-center justify-center text-[16px] font-medium border-b-2 select-none transition-colors relative ${
                  activeTab === tab
                    ? "text-[#09090B] border-[#6366F1] font-semibold"
                    : "text-[#A1A1AA] border-transparent hover:text-[#52525B] hover:bg-[#FAFAFA]"
                }`}
                data-testid={`feed-tab-${tab}`}
                data-tour={tab === "following" ? "following-tab" : tab === "foryou" ? "foryou-tab" : undefined}
              >
                {tab === "foryou" ? "For You" : "Following"}
                <div className="feed-tab-tooltip">
                  {tab === "foryou"
                    ? "Personalised episodes based on your interests, industries, and roles — including podcasts you don't follow yet"
                    : "Every new episode from the podcasts you follow, in chronological order"}
                </div>
              </button>
            ))}
          </div>
        </div>

        {podcastFilter && (
          <div className="bg-[#EEF2FF] px-4 py-2.5 flex items-center justify-between gap-2" data-testid="feed-podcast-filter-bar">
            <p className="text-[14px] font-medium text-[#6366F1]">
              Filtered by podcast: <span className="font-bold">{podcastFilter.replace(/-/g, ' ')}</span>
            </p>
            <button
              onClick={() => navigate("/dashboard")}
              className="text-[13px] font-semibold text-[#6366F1] hover:text-[#4F46E5] px-2 py-1 rounded-md hover:bg-[#6366F1]/10 transition-colors"
              data-testid="feed-clear-filter"
            >
              Clear filter
            </button>
          </div>
        )}

        <PodSquadBanner />

        <div className="flex-1 bg-white px-4 md:px-5 py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-[#6366F1]" />
              <span className="text-[14px] text-[#A1A1AA]">Loading your feed...</span>
            </div>
          ) : allItems.length === 0 ? (
            <div className="text-center py-20 px-8">
              <div className="w-16 h-16 rounded-full bg-[#F4F4F5] flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-7 h-7 text-[#A1A1AA]" />
              </div>
              <p className="text-[17px] font-bold text-[#09090B] mb-1">
                {activeTab === "following" ? "No followed podcasts yet" : "Nothing here yet"}
              </p>
              <p className="text-[14px] text-[#71717A] leading-relaxed">
                {activeTab === "following"
                  ? "Follow podcasts from the For You tab or Discover to see their recaps here."
                  : "Check back soon for fresh podcast recaps."}
              </p>
            </div>
          ) : (
            <>
              {allItems.map((item, index) => {
                const elements = [];
                if (feedAdsPool.length > 0 && index > 0 && index % adFrequency === 0) {
                  const adIndex = Math.floor(index / adFrequency) - 1;
                  const ad = feedAdsPool[adIndex % feedAdsPool.length];
                  if (ad) {
                    if (ad.type === "podcast") {
                      elements.push(
                        <PodcastAdCard
                          key={`ad-${ad.id}-${index}`}
                          ad={ad}
                          onFollow={(slug, adId) => handleFollowToggle(slug, true, adId)}
                        />
                      );
                    } else if (ad.type === "episode_recap") {
                      elements.push(
                        <EpisodeRecapAdCard
                          key={`ad-${ad.id}-${index}`}
                          ad={ad}
                          onFollow={(slug, adId) => handleFollowToggle(slug, true, adId)}
                        />
                      );
                    } else {
                      elements.push(
                        <RegularAdCard key={`ad-${ad.id}-${index}`} ad={ad} />
                      );
                    }
                  }
                }
                elements.push(
                  <RecapCard
                    key={item.id}
                    item={item}
                    onFollowToggle={handleFollowToggle}
                    bookmarkedKeys={bookmarkedKeys}
                    onBookmarkToggle={handleBookmarkToggle}
                    toast={toast}
                  />
                );
                return elements;
              })}
              <div ref={observerRef} className="py-8 flex flex-col items-center gap-2">
                {isFetchingNextPage ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[#6366F1]" />
                ) : hasNextPage ? (
                  <span className="text-[13px] text-[#A1A1AA]">Scroll for more</span>
                ) : allItems.length > 5 ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-[2px] bg-[#E4E4E7] rounded-full" />
                    <span className="text-[13px] text-[#A1A1AA] font-medium">You're all caught up</span>
                  </div>
                ) : null}
              </div>
            </>
          )}
          <div className="h-[80px] md:h-4" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
        </div>
      </div>
      <FeatureTour enabled={isWelcome} />
    </DashboardLayout>
  );
}
