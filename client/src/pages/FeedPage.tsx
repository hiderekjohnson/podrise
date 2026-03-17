import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageCircle, Bookmark, BookmarkCheck, Share, ChevronDown, Copy, ExternalLink, Search, Gift, ChevronRight, MoreHorizontal, Users, Building2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/DashboardLayout";
import { FeatureTour } from "@/components/FeatureTour";
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
  hosts: string | null;
  totalEpisodes: number | null;
  yearStarted: number | null;
  appleUrl: string | null;
  spotifyUrl: string | null;
  youtubeUrl: string | null;
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
        className="w-8 h-8 rounded-[7px] flex items-center justify-center text-[#A1A1AA] hover:bg-white hover:text-[#6366F1] transition-all"
        data-testid={`feed-share-${itemId}`}
      >
        <Share className="w-[15px] h-[15px]" />
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

function MentionsSection({ item, isBookmarked, onBookmarkToggle, onFollowToggle, toast }: {
  item: FeedItem;
  isBookmarked: boolean;
  onBookmarkToggle: (episodeSlug: string, podcastSlug: string) => void;
  onFollowToggle: (slug: string, follow: boolean) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"people" | "companies" | "products">("people");
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [showAllProducts, setShowAllProducts] = useState(false);

  const { people, companies, products } = item.mentions;
  const totalMentions = people.length + companies.length + products.length;

  if (totalMentions === 0) {
    return (
      <div className="border-t border-[#F0F0F2] bg-[#F7F7FC] flex items-center justify-end">
        <div className="flex items-center gap-[2px] px-[14px] py-2 flex-shrink-0">
          <button
            onClick={() => onBookmarkToggle(item.episodeSlug, item.podcastSlug)}
            className={`w-8 h-8 rounded-[7px] flex items-center justify-center transition-all ${isBookmarked ? "text-[#6366F1]" : "text-[#A1A1AA] hover:bg-white hover:text-[#6366F1]"}`}
            data-testid={`feed-bookmark-${item.id}`}
          >
            {isBookmarked ? <BookmarkCheck className="w-[15px] h-[15px]" /> : <Bookmark className="w-[15px] h-[15px]" />}
          </button>
          <SharePopover episodeTitle={item.episodeTitle} podcastSlug={item.podcastSlug} episodeSlug={item.episodeSlug} itemId={item.id} toast={toast} />
        </div>
      </div>
    );
  }

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

  const summaryParts: string[] = [];
  if (people.length > 0) summaryParts.push(`${people.length} ${people.length === 1 ? "person" : "people"}`);
  if (companies.length > 0) summaryParts.push(`${companies.length} ${companies.length === 1 ? "company" : "companies"}`);
  if (products.length > 0) summaryParts.push(`${products.length} ${products.length === 1 ? "product" : "products"}`);

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
    <div className={`border-t border-[#F0F0F2] bg-[#F7F7FC] ${open ? "ep-mentions-open" : ""}`} data-testid={`feed-mentions-${item.id}`}>
      <div className="flex items-stretch">
        <div
          className={`flex items-center gap-3 px-3 md:px-5 py-[11px] flex-1 min-w-0 cursor-pointer transition-colors ${open ? "bg-[#EEF2FF]" : "hover:bg-[#EEF2FF]"}`}
          onClick={() => setOpen(!open)}
          data-testid={`feed-mentions-toggle-${item.id}`}
        >
          <div className="flex items-center flex-shrink-0">
            {stackItems.map((m, i) => {
              const isPerson = i < people.length;
              const personImg = isPerson ? (PEOPLE_IMAGE_MAP.get(m.slug) || PEOPLE_IMAGE_MAP.get(m.name.toLowerCase())) : null;
              const companyImg = !isPerson ? (COMPANY_LOGO_MAP.get(m.slug) || COMPANY_LOGO_MAP.get(m.name.toLowerCase())) : null;
              const borderColor = open ? "#EEF2FF" : "#F7F7FC";
              if (isPerson && personImg) {
                return <img key={m.slug + i} src={personImg} alt={m.name} className={`w-[34px] h-[34px] rounded-full flex-shrink-0 object-cover ${i > 0 ? "-ml-[9px]" : ""}`} style={{ border: `2.5px solid ${borderColor}` }} loading="lazy" />;
              }
              if (!isPerson && companyImg) {
                return <img key={m.slug + i} src={companyImg} alt={m.name} className={`w-[34px] h-[34px] rounded-lg flex-shrink-0 object-cover bg-white ${i > 0 ? "-ml-[9px]" : ""}`} style={{ border: `2.5px solid ${borderColor}` }} loading="lazy" />;
              }
              const colors = getAvatarColor(i);
              return (
                <div
                  key={m.slug + i}
                  className={`w-[34px] h-[34px] flex-shrink-0 flex items-center justify-center text-[11px] font-bold ${i > 0 ? "-ml-[9px]" : ""} ${
                    isPerson ? "rounded-full" : "rounded-lg"
                  }`}
                  style={{ background: colors.bg, color: colors.color, border: `2.5px solid ${borderColor}` }}
                >
                  {getInitials(m.name)}
                </div>
              );
            })}
            {remaining > 0 && (
              <div className="w-[34px] h-[34px] rounded-full flex-shrink-0 -ml-[9px] bg-[#E4E4E7] text-[#71717A] text-[10px] font-bold flex items-center justify-center" style={{ fontFamily: "var(--font-mono)", border: `2.5px solid ${open ? "#EEF2FF" : "#F7F7FC"}` }}>
                +{remaining}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-[#09090B]">Mentioned in this episode</div>
            <div className="text-[13px] text-[#71717A] mt-[2px]">{summaryParts.join(" · ")}</div>
          </div>
          <ChevronDown className={`w-4 h-4 text-[#A1A1AA] flex-shrink-0 transition-transform ${open ? "rotate-180 text-[#6366F1]" : ""}`} />
        </div>
        <div className="flex items-center gap-[2px] px-[10px] md:px-[14px] py-2 border-l border-[#F0F0F2] flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onBookmarkToggle(item.episodeSlug, item.podcastSlug)}
            className={`w-8 h-8 rounded-[7px] flex items-center justify-center transition-all ${isBookmarked ? "text-[#6366F1]" : "text-[#A1A1AA] hover:bg-white hover:text-[#6366F1]"}`}
            data-testid={`feed-bookmark-${item.id}`}
          >
            {isBookmarked ? <BookmarkCheck className="w-[15px] h-[15px]" /> : <Bookmark className="w-[15px] h-[15px]" />}
          </button>
          <SharePopover episodeTitle={item.episodeTitle} podcastSlug={item.podcastSlug} episodeSlug={item.episodeSlug} itemId={item.id} toast={toast} />
          <button
            onClick={() => onFollowToggle(item.podcastSlug, !item.isFollowing)}
            className={`ml-1 px-4 py-[6px] rounded-full text-[13px] font-bold transition-all whitespace-nowrap ${
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
      <AnimatePresence>
        {open && (
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
        className="w-9 h-9 rounded-full flex items-center justify-center border border-[#D4D4D8] text-[#71717A] hover:text-[#6366F1] hover:border-[#6366F1]/30 transition-all bg-white"
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
  const headerTint = getHeaderTint(item.artworkUrl || item.podcastSlug);
  const allInsights = item.keyInsights || [];
  const whatHappenedParagraphs = item.whatHappened ? item.whatHappened.split(/\n\n+/).filter((p) => p.trim()) : [];

  return (
    <article
      className="bg-white border border-[#E4E4E7] rounded-2xl overflow-hidden mb-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
      data-testid={`feed-card-${item.id}`}
    >
      <div className="flex items-start gap-[18px] px-5 md:px-6 pt-5 pb-[18px]" style={{ background: headerTint }}>
        <div className="w-[120px] h-[120px] rounded-[14px] overflow-hidden flex-shrink-0 shadow-[0_4px_16px_rgba(0,0,0,0.16),0_1px_3px_rgba(0,0,0,0.08)] border border-black/[0.08]">
          <img src={hiResArtwork(item.artworkUrl)} alt={item.podcastName} className="w-full h-full object-cover" loading="lazy" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center min-h-[120px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/podcasts/${item.podcastSlug}`}>
                <span className="text-[18px] font-extrabold text-[#09090B] tracking-[-0.02em] leading-[1.1] mb-2 block hover:text-[#6366F1] transition-colors overflow-hidden text-ellipsis" data-testid={`feed-podcast-name-${item.id}`}>
                  {item.podcastName}
                </span>
              </Link>
              <div className="flex items-center gap-[14px] flex-wrap">
                {item.hosts && (
                  <div className="flex items-center gap-[5px] text-[14px] text-[#71717A] whitespace-nowrap">
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="opacity-40 flex-shrink-0"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z"/></svg>
                    {item.hosts}
                  </div>
                )}
                {item.totalEpisodes && (
                  <div className="flex items-center gap-[5px] text-[14px] text-[#71717A] whitespace-nowrap">
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="opacity-40 flex-shrink-0"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd"/></svg>
                    {item.totalEpisodes}+ episodes
                  </div>
                )}
                {item.yearStarted && (
                  <div className="flex items-center gap-[5px] text-[14px] text-[#71717A] whitespace-nowrap">
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" className="opacity-40 flex-shrink-0"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg>
                    Since {item.yearStarted}
                  </div>
                )}
              </div>
              <div className="w-[30px] h-[3px] rounded-full bg-[#6366F1]/40 mt-3" />
            </div>
            <div className="flex-shrink-0 pt-0.5">
              {item.isFollowing ? (
                <FollowMenuDropdown onUnfollow={() => onFollowToggle(item.podcastSlug, false)} itemId={item.id} />
              ) : (
                <button
                  onClick={() => onFollowToggle(item.podcastSlug, true)}
                  className="inline-flex items-center px-5 py-[7px] rounded-full text-[14px] font-bold transition-all bg-[#6366F1] text-white hover:bg-[#4F46E5]"
                  data-testid={`feed-follow-btn-${item.id}`}
                >
                  Follow
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-6 py-[18px] border-t border-[#F0F0F2] border-b border-b-[#F0F0F2]">
        <div className="flex items-baseline justify-between gap-3 mb-[9px]">
          <span className="text-[12px] text-[#A1A1AA] overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0" style={{ fontFamily: "var(--font-mono)" }} data-testid={`feed-episode-title-${item.id}`}>
            {item.episodeTitle}
          </span>
          <span className="text-[12px] text-[#A1A1AA] whitespace-nowrap flex-shrink-0" style={{ fontFamily: "var(--font-mono)" }} data-testid={`feed-time-${item.id}`}>
            {relativeTime(item.publishDate)}
          </span>
        </div>
        <h3 className="text-[26px] font-normal text-[#09090B] leading-[1.2] tracking-[-0.01em]" style={{ fontFamily: "var(--font-serif)" }} data-testid={`feed-headline-${item.id}`}>
          {item.tldl}
        </h3>
      </div>

      <div className="px-5 md:px-6 py-[22px]">
        {allInsights.length > 0 && (
          <div className="mb-5">
            <div className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#A1A1AA] mb-3" style={{ fontFamily: "var(--font-mono)" }}>Key Takeaways</div>
            <ul className="list-none p-0">
              {allInsights.map((insight, i) => (
                <li key={i} className="flex items-start gap-3 py-[10px] border-b border-[#F0F0F2] text-[16px] text-[#52525B] leading-[1.6] first:pt-0 last:border-b-0 last:pb-0">
                  <div className="w-[7px] h-[7px] rounded-full bg-[#6366F1] flex-shrink-0 mt-[8px]" />
                  <div>{insight}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {item.quote && (
          <div className="border-l-[3px] border-[#8B5CF6] rounded-r-[10px] px-[18px] py-[14px] bg-[#F7F7FC] mb-5">
            <div className="text-[18px] italic text-[#52525B] leading-[1.65] mb-2" style={{ fontFamily: "var(--font-serif)" }} data-testid={`feed-quote-${item.id}`}>
              "{item.quote}"
            </div>
            {item.quoteAttribution && (
              <div className="text-[12px] text-[#A1A1AA]" style={{ fontFamily: "var(--font-mono)" }}>— {item.quoteAttribution}</div>
            )}
          </div>
        )}

        {whatHappenedParagraphs.length > 0 && (
          <div>
            <div className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#A1A1AA] mb-3" style={{ fontFamily: "var(--font-mono)" }}>Episode Recap</div>
            <div className="text-[16px] text-[#52525B] leading-[1.8]" data-testid={`feed-recap-${item.id}`}>
              {whatHappenedParagraphs.map((para, i) => (
                <p key={i} className="mb-[14px] last:mb-0">{para}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      <MentionsSection
        item={item}
        isBookmarked={isBookmarked}
        onBookmarkToggle={onBookmarkToggle}
        onFollowToggle={onFollowToggle}
        toast={toast}
      />
    </article>
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
    onSuccess: () => { toast({ title: "Bookmarked", description: "Episode saved to your bookmarks" }); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] }); },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData<BookmarkRecord[]>(["/api/bookmarks"], context.previous);
      toast({ title: "Error", description: "Failed to bookmark episode", variant: "destructive" });
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
    onSuccess: () => { toast({ title: "Removed", description: "Episode removed from bookmarks" }); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] }); },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData<BookmarkRecord[]>(["/api/bookmarks"], context.previous);
      toast({ title: "Error", description: "Failed to remove bookmark", variant: "destructive" });
    },
  });

  const handleBookmarkToggle = useCallback((episodeSlug: string, podcastSlug: string) => {
    if (!user) { toast({ title: "Sign in required", description: "Log in to bookmark episodes", variant: "destructive" }); return; }
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
    mutationFn: async ({ podcastSlug, follow }: { podcastSlug: string; follow: boolean }) => {
      const endpoint = follow ? "/api/feed/follow" : "/api/feed/unfollow";
      const res = await apiRequest("POST", endpoint, { podcastSlug });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sidebar-suggestions"] });
      toast({
        title: variables.follow ? "Following" : "Unfollowed",
        description: variables.follow ? "Added to your feed and daily email recap" : "Removed from your feed and daily email",
      });
    },
    onError: () => { toast({ title: "Error", description: "Failed to update subscription", variant: "destructive" }); },
  });

  const handleFollowToggle = useCallback((slug: string, follow: boolean) => {
    if (!user) { toast({ title: "Sign in required", description: "Log in to follow podcasts", variant: "destructive" }); return; }
    followMutation.mutate({ podcastSlug: slug, follow });
  }, [user, followMutation, toast]);

  const allItems: FeedItem[] = data?.pages?.flatMap((p: any) => p.items) || [];

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
          <button
            onClick={() => navigate("/discover")}
            className="w-9 h-9 rounded-lg flex items-center justify-center self-center text-[#A1A1AA] hover:bg-[#F7F7FC] hover:text-[#6366F1] transition-all"
            data-testid="feed-search-btn"
          >
            <Search className="w-5 h-5" />
          </button>
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
              {allItems.map((item) => (
                <RecapCard
                  key={item.id}
                  item={item}
                  onFollowToggle={handleFollowToggle}
                  bookmarkedKeys={bookmarkedKeys}
                  onBookmarkToggle={handleBookmarkToggle}
                  toast={toast}
                />
              ))}
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
          <div className="h-[60px] md:h-4" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
        </div>
      </div>
      <FeatureTour enabled={isWelcome} />
    </DashboardLayout>
  );
}
