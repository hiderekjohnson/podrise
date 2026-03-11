import { useParams } from "wouter";
import { useEffect, useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, Tag, MessageSquare, Send, Loader2, Sparkles, BookOpen, ListChecks, MessageCircleQuestion, Globe, Users, Building2, Mic, ChevronDown, Brain, Rocket, TrendingUp, BarChart3, Wallet, Crown, Megaphone, Handshake, Zap, GitFork, Cpu, LineChart, Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, UserPlus, Cloud, GitBranch, Layout, Target, Cog, Bot, Coins, Leaf, Shield, Hammer, Briefcase, ExternalLink, Gift, Ticket, Copy, Check, Quote, Share2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { SiX, SiLinkedin, SiInstagram } from "react-icons/si";
import { getPodcastBySlug } from "../data/podcastLandingData";
import { PEOPLE_DIRECTORY, COMPANIES_DIRECTORY } from "../data/entityDirectoryData";
import { TOPICS } from "../data/topicData";
import { Link } from "wouter";
import { EpisodePageLayout } from "@/components/EpisodePageLayout";

const TOPIC_ICON_MAP: Record<string, LucideIcon> = {
  Brain, Rocket, Lightbulb, TrendingUp, BarChart3, Wallet, Crown, Megaphone,
  Handshake, Zap, GitFork, Cpu, LineChart, Building2, Heart, Flame,
  ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe, UserPlus,
  Cloud, GitBranch, Layout, Target, Cog, Bot, Coins, Leaf, Shield, Sparkles,
  Hammer, Briefcase, Tag,
};

interface TopQuestion {
  question: string;
  answer: string;
}

interface BookResource {
  name: string;
  type: string;
  description: string;
  url: string;
  author: string | null;
  context: string;
}

interface Sponsor {
  name: string;
  description?: string;
  couponCode?: string;
  url?: string;
  howToRedeem?: string;
}

interface EpisodeQuoteData {
  id: number;
  podcastSlug: string;
  episodeSlug: string;
  speakerName: string;
  speakerRole: string | null;
  quoteText: string;
  context: string;
  quoteType: string;
  sortOrder: number;
}


const AMAZON_AFFILIATE_TAG = "podcap-20";

function extractAsin(url: string): string | null {
  const patterns = [
    /\/dp\/([A-Za-z0-9]{10})/,
    /\/gp\/product\/([A-Za-z0-9]{10})/,
    /\/product\/([A-Za-z0-9]{10})/,
    /amazon\.com\/([A-Z0-9]{10})(?:[/?]|$)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

function getAmazonUrl(book: BookResource): string {
  const asin = extractAsin(book.url || "");
  if (asin) return `https://www.amazon.com/dp/${asin}?tag=${AMAZON_AFFILIATE_TAG}`;
  const searchQuery = encodeURIComponent(`${book.name}${book.author ? ` ${book.author}` : ""}`);
  return `https://www.amazon.com/s?k=${searchQuery}&tag=${AMAZON_AFFILIATE_TAG}`;
}

function BookCover({ title, asin, author, testId }: { title: string; asin: string | null; author?: string | null; testId: string }) {
  const [failed, setFailed] = useState(false);
  const [olSrc, setOlSrc] = useState<string | null>(null);
  const [olFailed, setOlFailed] = useState(false);

  useEffect(() => {
    if (asin && !failed) return;
    if (olSrc || olFailed) return;
    const q = encodeURIComponent(title);
    fetch(`https://openlibrary.org/search.json?q=${q}&limit=1&fields=cover_i`)
      .then(r => r.json())
      .then(data => {
        const coverId = data?.docs?.[0]?.cover_i;
        if (coverId) setOlSrc(`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`);
        else setOlFailed(true);
      })
      .catch(() => setOlFailed(true));
  }, [title, asin, failed, olSrc, olFailed]);

  const placeholder = (
    <div className="w-16 h-24 sm:w-20 sm:h-[120px] rounded-lg bg-amber-500/[0.06] flex items-center justify-center shrink-0 border border-amber-500/10" data-testid={testId}>
      <BookOpen className="w-5 h-5 text-amber-500/40" />
    </div>
  );

  if (asin && !failed) {
    return (
      <img
        src={`https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SX120_.jpg`}
        alt={title}
        className="w-16 h-24 sm:w-20 sm:h-[120px] rounded-lg object-cover shrink-0 shadow-sm border border-black/[0.06]"
        data-testid={testId}
        onError={() => setFailed(true)}
        loading="lazy"
      />
    );
  }

  if (olSrc && !olFailed) {
    return (
      <img
        src={olSrc}
        alt={title}
        className="w-16 h-24 sm:w-20 sm:h-[120px] rounded-lg object-cover shrink-0 shadow-sm border border-black/[0.06]"
        data-testid={testId}
        onError={() => setOlFailed(true)}
        loading="lazy"
      />
    );
  }

  return placeholder;
}

function GuestPhoto({ name, photoUrl, testId }: { name: string; photoUrl?: string; testId: string }) {
  const [failed, setFailed] = useState(false);

  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="w-[72px] h-[72px] sm:w-24 sm:h-24 rounded-full object-cover flex-shrink-0 border border-black/[0.06] dark:border-white/[0.08]"
        data-testid={testId}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="w-[72px] h-[72px] sm:w-24 sm:h-24 rounded-full bg-primary/[0.08] flex items-center justify-center flex-shrink-0" data-testid={testId}>
      <span className="text-lg font-bold text-primary">{name.charAt(0)}</span>
    </div>
  );
}

function SponsorCard({ sponsor, index }: { sponsor: Sponsor; index: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (sponsor.couponCode) {
      navigator.clipboard.writeText(sponsor.couponCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02] p-4 sm:p-5"
      data-testid={`sponsor-card-${index}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-teal-500/[0.08] flex items-center justify-center shrink-0">
          <Megaphone className="w-5 h-5 text-teal-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[17px] font-bold text-foreground" data-testid={`sponsor-name-${index}`}>
              {sponsor.name}
            </h3>
            {sponsor.url && (
              <a
                href={sponsor.url.startsWith("http") ? sponsor.url : `https://${sponsor.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                data-testid={`sponsor-url-${index}`}
              >
                Visit
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          {sponsor.description && (
            <p className="text-base leading-[1.8] text-muted-foreground mt-1.5" data-testid={`sponsor-description-${index}`}>
              {sponsor.description}
            </p>
          )}
          {sponsor.couponCode && (
            <div className="mt-3 flex items-center gap-2 flex-wrap" data-testid={`sponsor-coupon-${index}`}>
              <div className="inline-flex items-center gap-2 bg-teal-500/[0.06] border border-teal-500/[0.15] rounded-lg px-3 py-1.5">
                <Ticket className="w-4 h-4 text-teal-500 shrink-0" />
                <span className="text-sm font-bold text-teal-700 dark:text-teal-300 tracking-wide font-mono">{sponsor.couponCode}</span>
              </div>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                data-testid={`sponsor-copy-${index}`}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-teal-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy code"}
              </button>
            </div>
          )}
          {sponsor.howToRedeem && (
            <p className="text-sm text-muted-foreground/80 mt-2 leading-relaxed" data-testid={`sponsor-redeem-${index}`}>
              {sponsor.howToRedeem}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function QuoteShareBar({ quote, podcastName, episodeTitle }: { quote: EpisodeQuoteData; podcastName: string; episodeTitle: string }) {
  const shareText = `"${quote.quoteText}" - ${quote.speakerName}${quote.speakerRole ? `, ${quote.speakerRole}` : ""}\n\nFrom ${podcastName}: ${episodeTitle}\nvia @podcap_io`;
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(shareUrl);

  return (
    <div className="flex items-center gap-1.5" data-testid={`quote-share-bar-${quote.id}`}>
      <a
        href={`https://x.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors text-[13px] font-medium text-muted-foreground"
        title="Share on X"
        data-testid={`share-x-${quote.id}`}
      >
        <SiX className="w-3.5 h-3.5" />
        Share
      </a>
    </div>
  );
}

function QuoteCard({ quote, podcastName, episodeTitle, index }: { quote: EpisodeQuoteData; podcastName: string; episodeTitle: string; index: number }) {
  return (
    <div
      className="relative bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm"
      data-testid={`quote-card-${index}`}
    >
      <div className="px-6 py-5">
        <blockquote className="text-[17px] sm:text-[19px] leading-[1.7] font-medium text-foreground mb-4" data-testid={`quote-text-${index}`}>
          <span className="text-primary/40 text-2xl mr-1">{"\u201C"}</span>
          {quote.quoteText}
          <span className="text-primary/40 text-2xl ml-1">{"\u201D"}</span>
        </blockquote>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3" data-testid={`quote-speaker-${index}`}>
            <div className="w-8 h-8 rounded-full bg-primary/[0.08] flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-primary">{quote.speakerName.charAt(0)}</span>
            </div>
            <div>
              <p className="text-[15px] font-bold text-foreground">{quote.speakerName}</p>
              {quote.speakerRole && <p className="text-[13px] text-muted-foreground">{quote.speakerRole}</p>}
            </div>
          </div>
          <QuoteShareBar quote={quote} podcastName={podcastName} episodeTitle={episodeTitle} />
        </div>
      </div>
    </div>
  );
}

export default function EpisodeRecapPage() {
  const params = useParams<{ podcastSlug: string; episodeSlug: string }>();
  const podcastSlug = params.podcastSlug || "";
  const episodeSlug = params.episodeSlug || "";
  const [askInput, setAskInput] = useState("");
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("section-key-insights");
  const askSectionRef = useRef<HTMLDivElement>(null);

  const { data: episode, isLoading: episodeLoading } = useQuery<any>({
    queryKey: ["/api/podcasts", podcastSlug, "recaps", episodeSlug],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/recaps/${episodeSlug}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!podcastSlug && !!episodeSlug,
  });

  const { data: allRecaps = [] } = useQuery<any[]>({
    queryKey: ["/api/podcasts", podcastSlug, "recaps"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/recaps?limit=50`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!podcastSlug,
  });

  const { data: quotesData } = useQuery<{ quotes: EpisodeQuoteData[] }>({
    queryKey: ["/api/podcasts", podcastSlug, episodeSlug, "quotes"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/${episodeSlug}/quotes`);
      if (!res.ok) return { quotes: [] };
      return res.json();
    },
    enabled: !!podcastSlug && !!episodeSlug,
  });

  const episodeQuotes = quotesData?.quotes || [];

  interface Guest {
    name: string;
    title?: string;
    bio?: string;
    twitter?: string;
    linkedin?: string;
    instagram?: string;
    website?: string;
    photoUrl?: string;
  }

  const askMutation = useMutation({
    mutationFn: async (question: string) => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/${episodeSlug}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error("Failed to get answer");
      return res.json();
    },
    onSuccess: (data) => {
      setAskAnswer(data.answer);
    },
  });

  const guests: Guest[] = (() => {
    try {
      const raw = episode?.guests;
      if (!raw) return [];
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  })();

  const podcastConfig = getPodcastBySlug(podcastSlug);

  const { data: podcastHosts } = useQuery<any[]>({
    queryKey: ["/api/podcasts", podcastSlug, "hosts"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/hosts`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!podcastSlug,
  });

  const notablePeople = useMemo(() => {
    if (!episode) return [];
    const serverSlugs: string[] = (episode as any).matchedPeopleSlugs || [];
    if (serverSlugs.length > 0) {
      const slugSet = new Set(serverSlugs);
      return PEOPLE_DIRECTORY.filter(p => slugSet.has(p.slug)).slice(0, 12);
    }
    const searchText = `${episode.whatHappened || ""} ${episode.tldl || ""} ${episode.episodeTitle || ""}`;
    const guestNames = guests.map(g => g.name?.toLowerCase().trim()).filter(Boolean);
    const hostNameSet = new Set((podcastHosts || []).map((h: any) => h.name?.toLowerCase().trim()).filter(Boolean));
    return PEOPLE_DIRECTORY.filter(p => {
      const nameLower = p.name.toLowerCase();
      if (hostNameSet.has(nameLower)) return false;
      if (p.searchTerms.some(term => hostNameSet.has(term.toLowerCase()))) return false;
      return guestNames.some(gn => gn === nameLower) ||
        p.searchTerms.some(term => {
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'i');
          return regex.test(searchText);
        });
    }).slice(0, 12);
  }, [episode, guests, podcastHosts]);

  const notableCompanies = useMemo(() => {
    if (!episode) return [];
    const serverSlugs: string[] = (episode as any).matchedCompanySlugs || [];
    if (serverSlugs.length > 0) {
      const slugSet = new Set(serverSlugs);
      return COMPANIES_DIRECTORY.filter(c => slugSet.has(c.slug)).slice(0, 12);
    }
    const AMBIGUOUS_TERMS = new Set([
      "Notion", "Oracle", "Square", "Chase", "Visa", "Benchmark", "Snowflake",
      "Perplexity", "Bain", "Citadel", "Accel", "Sequoia",
      "The Information", "The Economist",
      "Claude", "Gemini", "Slack", "Discord", "Zoom", "Toast", "Runway",
      "Cursor", "Box", "Circle"
    ]);
    const originalText = `${episode.whatHappened || ""} ${episode.tldl || ""} ${episode.episodeTitle || ""}`;
    return COMPANIES_DIRECTORY.filter(c => {
      const allTerms = [...c.searchTerms, ...(c.associatedTerms || [])];
      return allTerms.some(term => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (AMBIGUOUS_TERMS.has(term)) {
          return new RegExp(`\\b${escaped}\\b`).test(originalText);
        }
        return new RegExp(`\\b${escaped}\\b`, 'i').test(originalText);
      });
    }).slice(0, 12);
  }, [episode]);

  const entityContexts: Record<string, string> = (episode as any)?.entityContexts || {};
  const hasNotableMentions = notablePeople.length > 0 || notableCompanies.length > 0;
  const hasHosts = (podcastHosts && podcastHosts.length > 0) || false;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [podcastSlug, episodeSlug]);

  useEffect(() => {
    if (!episode) {
      document.title = "Episode Not Found | PodCap";
      return;
    }

    const pageTitle = `${episode.episodeTitle} | ${episode.podcastName} Recap | PodCap`;
    const pageDescription = episode.tldl.slice(0, 155) + (episode.tldl.length > 155 ? "..." : "");
    const canonicalUrl = `https://podcap.io/podcasts/${podcastSlug}/${episodeSlug}`;

    document.title = pageTitle;

    const setMeta = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector);
      if (el) {
        el.setAttribute(attr, value);
      } else {
        const meta = document.createElement("meta");
        if (selector.includes("property=")) {
          meta.setAttribute("property", selector.match(/property="([^"]+)"/)?.[1] || "");
        } else if (selector.includes("name=")) {
          meta.setAttribute("name", selector.match(/name="([^"]+)"/)?.[1] || "");
        }
        meta.setAttribute(attr, value);
        document.head.appendChild(meta);
      }
    };

    setMeta('meta[name="description"]', "content", pageDescription);
    setMeta('meta[property="og:title"]', "content", pageTitle);
    setMeta('meta[property="og:description"]', "content", pageDescription);
    setMeta('meta[property="og:image"]', "content", episode.artworkUrl);
    setMeta('meta[property="og:url"]', "content", canonicalUrl);
    setMeta('meta[property="og:type"]', "content", "article");
    setMeta('meta[name="twitter:title"]', "content", pageTitle);
    setMeta('meta[name="twitter:description"]', "content", pageDescription);
    setMeta('meta[name="twitter:image"]', "content", episode.artworkUrl);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    return () => {
      document.title = "PodCap | Daily Podcast Recaps from Your Favorite Shows";
      if (canonical) canonical.remove();
    };
  }, [episode, podcastSlug, episodeSlug]);

  useEffect(() => {
    const sectionIds = [
      "section-key-insights",
      "section-quotes",
      "section-what-happened",
      "section-guests",
      "section-notable-mentions",
      "section-key-topics",
      "section-books",
      "section-top-questions",
      "section-ask-episode",
    ];

    const handleScroll = () => {
      const offset = 56 + 52 + 40;
      let current = sectionIds[0];
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= offset) {
          current = id;
        }
      }
      setActiveSection(current);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [episode]);

  const handleAskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!askInput.trim() || askMutation.isPending) return;
    setAskAnswer(null);
    askMutation.mutate(askInput.trim());
  };

  const askAiAbout = (entityName: string, entityType: "person" | "company") => {
    const question = entityType === "person"
      ? `In what context was ${entityName} mentioned in this episode?`
      : `In what context was ${entityName} discussed in this episode?`;
    setAskInput(question);
    setAskAnswer(null);
    askMutation.mutate(question);
    askSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (episodeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!episode || !podcastConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-display font-bold text-foreground mb-3" data-testid="text-not-found">Episode not found</h1>
          <p className="text-muted-foreground mb-6">This episode recap doesn't exist yet.</p>
          <Link href={podcastConfig ? `/podcasts/${podcastSlug}` : "/podcasts"}>
            <span className="text-primary font-semibold hover:underline" data-testid="link-back">
              {podcastConfig ? `Back to ${podcastConfig.name}` : "Browse all podcasts"}
            </span>
          </Link>
        </div>
      </div>
    );
  }

  const whatHappenedParagraphs = episode.whatHappened.split("\n\n").filter(Boolean);
  const matchedTopics = (() => {
    const searchText = `${episode.whatHappened || ""} ${episode.tldl || ""} ${episode.episodeTitle || ""} ${(episode.keyTopics || []).join(" ")}`.toLowerCase();
    const titleText = (episode.episodeTitle || "").toLowerCase();
    const keyTopicText = ((episode.keyTopics || []).join(" ")).toLowerCase();
    const scored = TOPICS.map(t => {
      let score = 0;
      const allKeywords = [...t.podcastKeywords];
      for (const kw of allKeywords) {
        const kwLower = kw.toLowerCase();
        const regex = new RegExp(`\\b${kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
        const bodyMatches = (searchText.match(regex) || []).length;
        if (bodyMatches === 0) continue;
        score += bodyMatches;
        if (regex.test(titleText)) score += 10;
        if (regex.test(keyTopicText)) score += 5;
      }
      return { topic: t, score };
    })
      .filter(s => s.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(s => s.topic);
    return scored;
  })();
  let topQuestions: TopQuestion[] = [];
  try {
    topQuestions = episode.topQuestions ? (typeof episode.topQuestions === "string" ? JSON.parse(episode.topQuestions) : episode.topQuestions) : [];
  } catch { topQuestions = []; }

  let books: BookResource[] = [];
  try {
    const allResources: BookResource[] = episode.resources ? (typeof episode.resources === "string" ? JSON.parse(episode.resources) : episode.resources) : [];
    books = allResources.filter(r => r.type === "book" && r.name);
  } catch { books = []; }

  let sponsors: Sponsor[] = [];
  try {
    const raw = episode.sponsors;
    if (raw) {
      sponsors = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!Array.isArray(sponsors)) sponsors = [];
      sponsors = sponsors.filter(s => s.name);
    }
  } catch { sponsors = []; }

  const parsedTopicContexts: Record<string, string> = (() => {
    try {
      const raw = (episode as any).topicContexts;
      if (!raw) return {};
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch { return {}; }
  })();
  const hasKeyTopics = matchedTopics.length > 0;
  const hasTopQuestions = topQuestions.length > 0;
  const hasBooks = books.length > 0;
  const hasSponsors = sponsors.length > 0;
  const hasQuotes = episodeQuotes.length > 0;

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const headerHeight = 56;
    const navHeight = 52;
    const offset = headerHeight + navHeight + 16;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <EpisodePageLayout
      episode={episode}
      podcastSlug={podcastSlug}
      episodeSlug={episodeSlug}
      podcastConfig={podcastConfig}
      activeTab="recap"
      allRecaps={allRecaps}
    >
      <motion.article
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="space-y-8"
      >
        <nav className="sticky top-[56px] z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2.5 bg-background/90 backdrop-blur-md border-b border-black/[0.06] flex items-center gap-2 overflow-x-auto hide-scrollbar" data-testid="nav-in-page">
          {episode.keyInsights?.length > 0 && (
            <button
              onClick={() => scrollTo("section-key-insights")}
              className={`px-4 py-2.5 text-[15px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-key-insights" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-key-insights"
            >
              Takeaways
            </button>
          )}
          {hasQuotes && (
            <button
              onClick={() => scrollTo("section-quotes")}
              className={`px-4 py-2.5 text-[15px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-quotes" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-quotes"
            >
              Quotes
            </button>
          )}
          <button
            onClick={() => scrollTo("section-what-happened")}
            className={`px-4 py-2.5 text-[15px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-what-happened" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
            data-testid="nav-what-happened"
          >
            Recap
          </button>
          {(guests.length > 0 || hasHosts) && (
            <button
              onClick={() => scrollTo("section-guests")}
              className={`px-4 py-2.5 text-[15px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-guests" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-people"
            >
              Participants
            </button>
          )}
          {hasNotableMentions && (
            <button
              onClick={() => scrollTo("section-notable-mentions")}
              className={`px-4 py-2.5 text-[15px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-notable-mentions" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-notable-mentions"
            >
              Mentions
            </button>
          )}
          {hasKeyTopics && (
            <button
              onClick={() => scrollTo("section-key-topics")}
              className={`px-4 py-2.5 text-[15px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-key-topics" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-key-topics"
            >
              Topics
            </button>
          )}
          {hasBooks && (
            <button
              onClick={() => scrollTo("section-books")}
              className={`px-4 py-2.5 text-[15px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-books" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-books"
            >
              Books
            </button>
          )}
          {/* Sponsors nav chip — disabled for now, enable when podcaster promotion tools go public */}
          {hasTopQuestions && (
            <button
              onClick={() => scrollTo("section-top-questions")}
              className={`px-4 py-2.5 text-[15px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-top-questions" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-top-questions"
            >
              Q&A
            </button>
          )}
          <button
            onClick={() => scrollTo("section-ask-episode")}
            className={`px-4 py-2.5 text-[15px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-ask-episode" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
            data-testid="nav-ask"
          >
            Ask AI
          </button>
        </nav>

        <section className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-about-episode">
          <div className="px-6 py-4 bg-slate-500/[0.04] border-b border-slate-500/[0.08]">
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-4 h-4 text-slate-500" />
              <span className="text-base font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">About This Episode</span>
            </div>
            <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-1.5">A quick summary of what this {episode.podcastName} episode covers.</p>
          </div>
          <div className="px-6 py-5">
            <p className="text-base leading-[1.85] text-muted-foreground">
              {episode.tldl}
              {guests.length > 0 && (
                <>{" "}Featuring {guests.map((g, i) => {
                  const parts = [];
                  parts.push(g.name);
                  if (g.title) parts[0] += `, ${g.title}`;
                  return parts[0];
                }).join(", ")}.
                </>
              )}
              {episode.hosts && <>{" "}Hosted by {episode.hosts.replace(/&amp;/g, "&")}.</>}
            </p>
          </div>
        </section>

        {episode.keyInsights?.length > 0 && (
          <section id="section-key-insights" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-key-insights">
            <div className="px-6 py-4 bg-amber-500/[0.04] border-b border-amber-500/[0.08]">
              <div className="flex items-center gap-2.5">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <span className="text-base font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Key Takeaways</span>
              </div>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-1.5">The biggest insights from this episode of {episode.podcastName}.</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              {episode.keyInsights.map((insight: string, i: number) => (
                <div
                  key={i}
                  className="flex gap-3.5 items-start"
                  data-testid={`insight-${i}`}
                >
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 text-[15px] font-bold">
                    {i + 1}
                  </span>
                  <p className="text-base leading-[1.8] text-muted-foreground">{insight}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {hasQuotes && (
          <section id="section-quotes" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-quotes">
            <div className="px-6 py-4 bg-violet-500/[0.04] border-b border-violet-500/[0.08]">
              <div className="flex items-center gap-2.5">
                <Quote className="w-4 h-4 text-violet-500" />
                <span className="text-base font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wider">Notable Quotes</span>
              </div>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-1.5">The most shareable lines from this episode of {episode.podcastName}.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {episodeQuotes.map((q, i) => (
                <QuoteCard
                  key={q.id}
                  quote={q}
                  podcastName={episode.podcastName}
                  episodeTitle={episode.episodeTitle}
                  index={i}
                />
              ))}
            </div>
          </section>
        )}

        <section id="section-what-happened" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-what-happened">
          <div className="px-6 py-4 bg-primary/[0.04] border-b border-primary/[0.08]">
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-4 h-4 text-primary" />
              <span className="text-base font-bold text-primary uppercase tracking-wider">Full Recap</span>
            </div>
            <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-1.5">A detailed breakdown of everything discussed in this episode.</p>
          </div>
          <div className="px-6 py-5 space-y-5">
            {whatHappenedParagraphs.map((paragraph: string, i: number) => (
              <p key={i} className="text-[17px] leading-[1.85] text-muted-foreground">
                {i === 0 && <span className="text-foreground font-semibold">{paragraph.split(" ").slice(0, 3).join(" ")} </span>}
                {i === 0 ? paragraph.split(" ").slice(3).join(" ") : paragraph}
              </p>
            ))}
          </div>
        </section>

        {(guests.length > 0 || (hasHosts && podcastHosts)) && (
          <section id="section-guests" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-guests">
            <div className="px-6 py-4 bg-sky-500/[0.04] border-b border-sky-500/[0.08]">
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-sky-500" />
                <span className="text-base font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider">Participants in This Episode</span>
              </div>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-1.5" data-testid="participants-intro">The {guests.length > 0 ? "guest" + (guests.length > 1 ? "s" : "") + " and " : ""}hosts featured in this episode of the {episode.podcastName} podcast.</p>
            </div>
            <div className="px-6 py-5">

              {guests.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-base font-bold text-muted-foreground uppercase tracking-wider mb-4" data-testid="participants-guest-label">{guests.length > 1 ? "Guests" : "Guest"}</h3>
                  <div className="space-y-5">
                    {guests.map((guest, i) => (
                      <div key={i} className="flex items-start gap-4" data-testid={`guest-card-${i}`}>
                        <GuestPhoto name={guest.name} photoUrl={guest.photoUrl} testId={`guest-photo-${i}`} />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[17px] font-bold text-foreground" data-testid={`guest-name-${i}`}>
                            {guest.name}
                          </h4>
                          <p className="text-[15px] leading-[1.8] text-muted-foreground mt-1">
                            {guest.title ? guest.title + ". " : ""}{guest.bio || ""}
                          </p>
                          {(guest.twitter || guest.linkedin || guest.instagram || guest.website) && (
                            <div className="flex items-center gap-3 mt-2.5">
                              {guest.twitter && (
                                <a href={guest.twitter.startsWith("http") ? guest.twitter : `https://x.com/${guest.twitter.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" data-testid={`guest-twitter-${i}`} title="X / Twitter">
                                  <SiX className="w-4 h-4" />
                                  <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/40" />
                                </a>
                              )}
                              {guest.linkedin && (
                                <a href={guest.linkedin.startsWith("http") ? guest.linkedin : `https://linkedin.com/in/${guest.linkedin}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" data-testid={`guest-linkedin-${i}`} title="LinkedIn">
                                  <SiLinkedin className="w-4 h-4" />
                                  <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/40" />
                                </a>
                              )}
                              {guest.instagram && (
                                <a href={guest.instagram.startsWith("http") ? guest.instagram : `https://instagram.com/${guest.instagram.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" data-testid={`guest-instagram-${i}`} title="Instagram">
                                  <SiInstagram className="w-4 h-4" />
                                  <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/40" />
                                </a>
                              )}
                              {guest.website && (
                                <a href={guest.website.startsWith("http") ? guest.website : `https://${guest.website}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors" data-testid={`guest-website-${i}`} title="Website">
                                  <Globe className="w-4 h-4" />
                                  <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/40" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hasHosts && podcastHosts && (
                <div>
                  <h3 className="text-base font-bold text-muted-foreground uppercase tracking-wider mb-4" data-testid="participants-hosts-label">Hosts</h3>
                  <div className="space-y-5">
                    {podcastHosts.map((host: any, i: number) => (
                      <div key={i} className="flex items-start gap-4" data-testid={`host-card-${i}`}>
                        {host.photoUrl ? (
                          <img
                            src={host.photoUrl}
                            alt={host.name}
                            className="w-[72px] h-[72px] sm:w-24 sm:h-24 rounded-full object-cover flex-shrink-0 bg-muted border border-black/[0.06] dark:border-white/[0.08]"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-[72px] h-[72px] sm:w-24 sm:h-24 rounded-full bg-primary/[0.08] flex items-center justify-center flex-shrink-0">
                            <span className="text-lg font-bold text-primary">{host.name.charAt(0)}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[17px] font-bold text-foreground" data-testid={`host-name-${i}`}>{host.name}</h4>
                          {host.bio && (
                            <p className="text-[15px] leading-[1.8] text-muted-foreground mt-1">{host.bio.replace(/<[^>]*>/g, "").split("\n")[0]}</p>
                          )}
                          {(host.twitterHandle || host.linkedinUrl || host.instagramHandle || host.websiteUrl) && (
                            <div className="flex items-center gap-3 mt-2.5">
                              {host.twitterHandle && (
                                <a href={host.twitterHandle.startsWith("http") ? host.twitterHandle : `https://x.com/${host.twitterHandle.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" data-testid={`host-twitter-${i}`}>
                                  <SiX className="w-4 h-4" />
                                  <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/40" />
                                </a>
                              )}
                              {host.linkedinUrl && (
                                <a href={host.linkedinUrl.startsWith("http") ? host.linkedinUrl : `https://linkedin.com/in/${host.linkedinUrl}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" data-testid={`host-linkedin-${i}`}>
                                  <SiLinkedin className="w-4 h-4" />
                                  <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/40" />
                                </a>
                              )}
                              {host.instagramHandle && (
                                <a href={host.instagramHandle.startsWith("http") ? host.instagramHandle : `https://instagram.com/${host.instagramHandle.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" data-testid={`host-instagram-${i}`}>
                                  <SiInstagram className="w-4 h-4" />
                                  <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/40" />
                                </a>
                              )}
                              {host.websiteUrl && (
                                <a href={host.websiteUrl.startsWith("http") ? host.websiteUrl : `https://${host.websiteUrl}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" data-testid={`host-website-${i}`}>
                                  <Globe className="w-4 h-4" />
                                  <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/40" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {hasNotableMentions && (
          <section id="section-notable-mentions" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-notable-mentions">
            <div className="px-6 py-4 bg-orange-500/[0.04] border-b border-orange-500/[0.08]">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-orange-500" />
                <span className="text-base font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider">Notable Mentions</span>
              </div>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-1.5">Key people and companies discussed in this episode of {episode.podcastName}{episode.hosts ? ` with ${episode.hosts.replace(/&amp;/g, "&")}` : ""}.</p>
            </div>
            <div className="px-6 py-5 space-y-6">
              {notablePeople.length > 0 && (
                <div data-testid="section-notable-people">
                  <h3 className="text-base font-bold text-foreground uppercase tracking-wider mb-4">People Mentioned</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {notablePeople.map((person, i) => (
                      <div key={person.slug} className="group/card rounded-xl border border-black/[0.06] dark:border-white/[0.08] hover:border-orange-500/30 bg-black/[0.01] dark:bg-white/[0.02] hover:bg-orange-500/[0.03] transition-all" data-testid={`notable-person-${i}`}>
                        <Link href={`/people/${person.slug}`}>
                          <div className="flex items-center gap-3.5 px-4 pt-4 pb-2.5 cursor-pointer">
                            <img
                              src={person.imageUrl}
                              alt={person.name}
                              className="w-[72px] h-[72px] sm:w-24 sm:h-24 rounded-full object-cover flex-shrink-0 bg-muted ring-2 ring-black/[0.04] dark:ring-white/[0.08]"
                              loading="lazy"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-bold text-foreground group-hover/card:text-orange-600 dark:group-hover/card:text-orange-400 transition-colors truncate">{person.name}</p>
                              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]/80 truncate mt-0.5">{person.title}</p>
                            </div>
                          </div>
                        </Link>
                        <div className="px-4 pb-3.5">
                          {entityContexts[person.slug] && (
                            <p className="text-base leading-relaxed text-muted-foreground mb-2.5">{entityContexts[person.slug]}</p>
                          )}
                          <button
                            onClick={() => askAiAbout(person.name, "person")}
                            className="text-base font-semibold text-violet-500 dark:text-violet-400 hover:text-violet-600 dark:hover:text-violet-300 flex items-center gap-1.5 transition-colors"
                            data-testid={`ask-ai-person-${i}`}
                          >
                            <Sparkles className="w-5 h-5" /> Ask AI for context
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]/70 mt-5 italic" data-testid="notable-people-footnote">Only the most notable mentions are included.</p>
                </div>
              )}
              {notableCompanies.length > 0 && (
                <div data-testid="section-notable-companies">
                  <h3 className="text-base font-bold text-foreground uppercase tracking-wider mb-4">Companies Mentioned</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {notableCompanies.map((company, i) => (
                      <div key={company.slug} className="group/card rounded-xl border border-black/[0.06] dark:border-white/[0.08] hover:border-orange-500/30 bg-black/[0.01] dark:bg-white/[0.02] hover:bg-orange-500/[0.03] transition-all" data-testid={`notable-company-${i}`}>
                        <Link href={`/companies/${company.slug}`}>
                          <div className="flex items-center gap-3.5 px-4 pt-4 pb-2.5 cursor-pointer">
                            <img
                              src={company.logoUrl}
                              alt={company.name}
                              className="w-[72px] h-[72px] sm:w-24 sm:h-24 rounded-lg object-contain flex-shrink-0 bg-muted p-2 ring-2 ring-black/[0.04] dark:ring-white/[0.08]"
                              loading="lazy"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-bold text-foreground group-hover/card:text-orange-600 dark:group-hover/card:text-orange-400 transition-colors truncate">{company.name}</p>
                              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]/80 truncate mt-0.5">{company.details.industry}</p>
                            </div>
                          </div>
                        </Link>
                        <div className="px-4 pb-3.5">
                          {entityContexts[company.slug] && (
                            <p className="text-base leading-relaxed text-muted-foreground mb-2.5">{entityContexts[company.slug]}</p>
                          )}
                          <button
                            onClick={() => askAiAbout(company.name, "company")}
                            className="text-base font-semibold text-violet-500 dark:text-violet-400 hover:text-violet-600 dark:hover:text-violet-300 flex items-center gap-1.5 transition-colors"
                            data-testid={`ask-ai-company-${i}`}
                          >
                            <Sparkles className="w-5 h-5" /> Ask AI for context
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]/70 mt-5 italic" data-testid="notable-companies-footnote">Only the most notable mentions are included.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {hasKeyTopics && (
          <section id="section-key-topics" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-key-topics">
            <div className="px-6 py-4 bg-emerald-500/[0.04] border-b border-emerald-500/[0.08]">
              <div className="flex items-center gap-2.5">
                <Tag className="w-4 h-4 text-emerald-500" />
                <span className="text-base font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Key Topics in This {episode.podcastName} Episode</span>
              </div>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-1.5">Main themes discussed in this episode{episode.hosts ? ` with ${episode.hosts.replace(/&amp;/g, "&")}` : ""}.</p>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {matchedTopics.map((topic, i) => {
                  const IconComponent = TOPIC_ICON_MAP[topic.icon] || Tag;
                  const contextDesc = parsedTopicContexts[topic.slug];
                  const displayDesc = contextDesc || `${topic.description.split(".")[0]}.`;
                  return (
                    <Link
                      key={topic.slug}
                      href={`/topics/${topic.slug}`}
                      className="group/topic flex gap-3.5 p-4 rounded-xl border border-black/[0.06] dark:border-white/[0.08] hover:border-emerald-500/30 bg-black/[0.01] dark:bg-white/[0.02] hover:bg-emerald-500/[0.03] transition-all"
                      data-testid={`topic-link-${i}`}
                    >
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${topic.color} flex items-center justify-center shrink-0`}>
                        <IconComponent className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-[15px] font-bold text-foreground group-hover/topic:text-emerald-600 dark:group-hover/topic:text-emerald-400 transition-colors">{topic.name}</h4>
                        <p className="text-base leading-snug text-muted-foreground mt-0.5 line-clamp-2">{displayDesc}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )}


        {hasBooks && (
          <section id="section-books" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-books">
            <div className="px-6 py-4 bg-amber-500/[0.04] border-b border-amber-500/[0.08]">
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-4 h-4 text-amber-600" />
                <h2 className="text-base font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider m-0">Books Mentioned in This Episode</h2>
              </div>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-1.5">Books recommended or discussed in this {episode.podcastName} episode.</p>
            </div>
            <div className="px-6 py-5">
              <div className="space-y-5">
                {books.map((book, i) => {
                  const asin = extractAsin(book.url || "");
                  const amazonUrl = getAmazonUrl(book);
                  return (
                    <div
                      key={i}
                      className="flex gap-4 sm:gap-5"
                      data-testid={`book-card-${i}`}
                    >
                      <BookCover title={book.name} asin={asin} author={book.author} testId={`book-cover-${i}`} />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[15px] font-bold text-foreground leading-snug" data-testid={`book-title-${i}`}>
                          {book.name}
                        </h3>
                        {book.author && book.author !== "null" && (() => {
                          const authorPerson = PEOPLE_DIRECTORY.find(p => p.name.toLowerCase() === book.author!.toLowerCase());
                          return (
                            <p className="text-sm text-[#3F3F46] dark:text-[#A1A1AA] mt-0.5" data-testid={`book-author-${i}`}>
                              by {authorPerson ? (
                                <Link href={`/people/${authorPerson.slug}`} className="text-amber-700 dark:text-amber-400 hover:underline" onClick={(e) => e.stopPropagation()}>
                                  {book.author}
                                </Link>
                              ) : book.author}
                            </p>
                          );
                        })()}
                        {book.context && (
                          <p className="text-base text-muted-foreground leading-relaxed mt-2 line-clamp-3" data-testid={`book-context-${i}`}>
                            {book.context}
                          </p>
                        )}
                        <a
                          href={amazonUrl}
                          target="_blank"
                          rel="sponsored noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors mt-2"
                          data-testid={`book-amazon-${i}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {asin ? "Buy on Amazon" : "Find on Amazon"}
                          <ExternalLink className="w-3 h-3 text-amber-700/40 dark:text-amber-400/40" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground/50 mt-5 pt-4 border-t border-black/[0.04] dark:border-white/[0.04]">
                Amazon links may earn PodCap a small commission at no extra cost to you.
              </p>
            </div>
          </section>
        )}

        {/* Sponsors section — disabled for now, enable when podcaster promotion tools go public */}

        {hasTopQuestions && (
          <>
            <section id="section-top-questions" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-top-questions">
              <div className="px-6 py-4 bg-violet-500/[0.04] border-b border-violet-500/[0.08]">
                <div className="flex items-center gap-2.5">
                  <MessageCircleQuestion className="w-4 h-4 text-violet-500" />
                  <h2 className="text-base font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wider m-0">Key Questions Discussed in This {episode.podcastName} Podcast Episode</h2>
                </div>
                <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-1.5" data-testid="questions-intro">The most important questions explored in this episode{episode.hosts ? ` with ${episode.hosts.replace(/&amp;/g, "&")}` : ""}.</p>
              </div>
              <div className="px-6 py-5">
                <div className="space-y-0 divide-y divide-border">
                {topQuestions.slice(0, 6).map((item, i) => {
                  const anchorSlug = item.question
                    .toLowerCase()
                    .replace(/[?''""!.,;:]/g, '')
                    .replace(/\s+/g, '-')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '')
                    .slice(0, 60);
                  return (
                    <details key={i} id={anchorSlug} className="group scroll-mt-24" data-testid={`question-item-${i}`}>
                      <summary className="flex items-center justify-between gap-3 py-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden" data-testid={`question-heading-${i}`}>
                        <h3 className="text-[17px] font-semibold text-foreground leading-snug">{item.question}</h3>
                        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="pb-4 pt-1">
                        {item.answer.split("\n\n").filter(Boolean).map((p, j) => (
                          <p key={j} className="text-base leading-[1.85] text-muted-foreground mb-2 last:mb-0">{p}</p>
                        ))}
                      </div>
                    </details>
                  );
                })}
                </div>
              </div>
            </section>
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  "mainEntity": topQuestions.slice(0, 6).map(item => ({
                    "@type": "Question",
                    "name": item.question,
                    "acceptedAnswer": {
                      "@type": "Answer",
                      "text": item.answer,
                    },
                  })),
                }),
              }}
            />
          </>
        )}

        <section id="section-ask-episode" ref={askSectionRef} className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02] scroll-mt-24" data-testid="section-ask-episode">
          <div className="px-6 py-4 bg-violet-500/[0.04] border-b border-violet-500/[0.08]">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-violet-500" />
              <span className="text-base font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wider">Ask the AI About This Episode</span>
              <span className="ml-auto inline-flex items-center gap-1 text-[15px] font-bold text-violet-500 bg-violet-500/[0.08] px-2 py-0.5 rounded-full uppercase tracking-wider"><Sparkles className="w-3 h-3" /> AI</span>
            </div>
            <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-1.5">Search the full transcript of this {episode.podcastName} episode and ask questions about anything discussed.</p>
          </div>
          <div className="px-6 py-5">
            <form onSubmit={handleAskSubmit} className="flex gap-2" data-testid="form-ask-episode">
              <input
                type="text"
                value={askInput}
                onChange={(e) => setAskInput(e.target.value)}
                placeholder="Ask anything this episode said about..."
                className="flex-1 h-11 px-4 bg-black/[0.02] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] rounded-xl text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/30 transition-all placeholder:text-muted-foreground/40"
                data-testid="input-ask-episode"
              />
              <button
                type="submit"
                disabled={!askInput.trim() || askMutation.isPending}
                className="h-11 px-5 flex items-center gap-2 rounded-xl font-bold text-base bg-violet-500 text-white shadow-sm hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
                data-testid="button-ask-submit"
              >
                {askMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Ask
              </button>
            </form>

            {!askAnswer && !askMutation.isPending && (() => {
              const keyQuestionTexts = new Set(topQuestions.map(q => q.question));
              const aiPrompts: string[] = [];
              if (guests.length > 0) aiPrompts.push(`What is ${guests[0].name}'s main argument?`);
              const topics = matchedTopics.slice(0, 3);
              if (topics.length > 0) aiPrompts.push(`What does this episode say about ${topics[0].name.toLowerCase()}?`);
              if (episode.keyInsights && episode.keyInsights.length > 0) aiPrompts.push("What was the most surprising insight?");
              if (guests.length > 1) aiPrompts.push(`What did ${guests[1].name} contribute?`);
              if (topics.length > 1) aiPrompts.push(`How is ${topics[1].name.toLowerCase()} discussed?`);
              aiPrompts.push("What are the key takeaways?");
              aiPrompts.push("What predictions were made?");
              const filtered = aiPrompts.filter(p => !keyQuestionTexts.has(p)).slice(0, 4);
              if (filtered.length === 0) return null;
              return (
                <div className="mt-4" data-testid="ask-example-prompts">
                  <p className="text-[15px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Try asking:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {filtered.map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setAskInput(prompt);
                          setAskAnswer(null);
                          askMutation.mutate(prompt);
                        }}
                        className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 hover:bg-violet-500/[0.06] px-2.5 py-1 rounded-lg transition-colors text-left"
                        data-testid={`ask-example-${i}`}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <AnimatePresence>
              {(askAnswer || askMutation.isPending) && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.3 }}
                  className="mt-5 bg-violet-500/[0.03] border border-violet-500/[0.1] rounded-xl px-5 py-4"
                  data-testid="ask-answer-container"
                >
                  {askMutation.isPending ? (
                    <div className="flex items-center gap-3 py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                      <span className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">Searching the transcript...</span>
                    </div>
                  ) : askAnswer ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare className="w-5 h-5 text-violet-500" />
                        <span className="text-[15px] font-bold text-violet-500 uppercase tracking-wider">Answer</span>
                      </div>
                      {askAnswer.split("\n\n").filter(Boolean).map((p, i) => (
                        <p key={i} className="text-[15px] leading-[1.8] text-muted-foreground">{p}</p>
                      ))}
                    </div>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>

            {askMutation.isError && (
              <p className="mt-3 text-base text-red-500" data-testid="ask-error">
                Unable to generate an answer. The transcript may not be available for this episode.
              </p>
            )}
          </div>
        </section>
      </motion.article>
    </EpisodePageLayout>
  );
}
