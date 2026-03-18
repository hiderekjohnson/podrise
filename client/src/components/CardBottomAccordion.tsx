import { useState, useEffect } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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

export interface MentionEntry {
  slug: string;
  name: string;
  role: string | null;
  company: string | null;
  context: string | null;
}

export interface ProductEntry {
  name: string;
  company: string | null;
  description: string | null;
  imageUrl: string | null;
  category: string;
  purchaseUrl: string | null;
}

export interface AccordionItemData {
  id: number;
  episodeSlug: string;
  podcastSlug: string;
  episodeTitle: string;
  whatHappened: string | null;
  spotifyEpisodeUrl: string | null;
  spotifyUrl: string | null;
  youtubeUrl: string | null;
  mentions: {
    people: MentionEntry[];
    companies: MentionEntry[];
    products: ProductEntry[];
  };
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

export function parseSpotifyEpisodeId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/open\.spotify\.com\/episode\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

export function parseYouTubeVideoId(url: string | null): string | null {
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

function ListenSection({ item }: { item: AccordionItemData }) {
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
        <iframe
          src={`https://www.youtube.com/embed/${youtubeId}`}
          width="100%"
          height="200"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          className="rounded-xl"
          data-testid={`listen-youtube-embed-${item.id}`}
        />
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

export function CardBottomAccordion({ item, bottomBar }: {
  item: AccordionItemData;
  bottomBar: React.ReactNode;
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

      {bottomBar}
    </div>
  );
}
