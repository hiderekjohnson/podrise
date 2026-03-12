import { useParams } from "wouter";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Lightbulb, Loader2, Sparkles, BookOpen, MessageCircleQuestion, Globe, Users, Building2, Mic, ChevronDown, ChevronRight, Megaphone, ExternalLink, Ticket, Copy, Check, Quote, Share2, X, Star, MessageCircle, Send, ArrowUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SiX, SiLinkedin, SiInstagram } from "react-icons/si";
import { getPodcastBySlug } from "../data/podcastLandingData";
import { PEOPLE_DIRECTORY, COMPANIES_DIRECTORY } from "../data/entityDirectoryData";
import { Link } from "wouter";
import { EpisodePageLayout } from "@/components/EpisodePageLayout";

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

function getBlinkistUrl(book: BookResource): string {
  const slug = book.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://www.blinkist.com/en/books/${slug}-en`;
}

function BookCover({ title, slug, googleBooksId, testId }: { title: string; asin?: string | null; slug?: string | null; author?: string | null; googleBooksId?: string | null; testId: string }) {
  const [srcIndex, setSrcIndex] = useState(0);
  useEffect(() => { setSrcIndex(0); }, [slug, googleBooksId]);
  const sources: string[] = [];
  if (slug) sources.push(`/books/${slug}.jpg`);
  if (googleBooksId) sources.push(`https://books.google.com/books/content?id=${googleBooksId}&printsec=frontcover&img=1&zoom=2&source=gbs_api`);
  const imgCls = "w-16 h-24 sm:w-20 sm:h-[120px] rounded-lg object-cover shrink-0 shadow-sm border border-black/[0.06]";

  const advance = () => setSrcIndex(s => s + 1);
  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const isGoogleBooks = (sources[srcIndex] || "").includes("books.google.com");
    if (isGoogleBooks && img.naturalWidth < 150 && img.naturalHeight < 220) advance();
  };

  if (srcIndex < sources.length) {
    return (
      <img src={sources[srcIndex]} alt={title} className={imgCls} data-testid={testId} onError={advance} onLoad={handleLoad} loading="lazy" />
    );
  }

  return (
    <div className="w-16 h-24 sm:w-20 sm:h-[120px] rounded-lg bg-amber-500/[0.06] flex items-center justify-center shrink-0 border border-amber-500/10" data-testid={testId}>
      <BookOpen className="w-5 h-5 text-amber-500/40" />
    </div>
  );
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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatContextRef {
  open: (entityName?: string, entityType?: string, initialQuestion?: string) => void;
}

function getAutoQuestion(entityName: string, entityType: string, podcastName?: string): string {
  const show = podcastName || "this episode";
  switch (entityType) {
    case "person": return `How was ${entityName} mentioned in this episode of ${show}?`;
    case "company": return `How was ${entityName} discussed in this episode of ${show}?`;
    case "topic": return `How was ${entityName} discussed in this episode?`;
    case "book": return `How was "${entityName}" referenced in this episode?`;
    case "insight": return `Can you expand on this takeaway: "${entityName}"?`;
    default: return `Tell me more about ${entityName} in this episode.`;
  }
}

function DeepDiveButton({ label, entityName, entityType, chatRef, podcastName }: {
  label?: string;
  entityName: string;
  entityType: string;
  chatRef: React.RefObject<ChatContextRef | null>;
  podcastName?: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const q = getAutoQuestion(entityName, entityType, podcastName);
        chatRef.current?.open(entityName, entityType, q);
      }}
      className="inline-flex items-center gap-1 text-[16px] font-medium text-primary/70 hover:text-primary transition-colors group/ai"
      data-testid={`deep-dive-${entityType}-${entityName.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <Sparkles className="w-3 h-3 group-hover/ai:scale-110 transition-transform" />
      {label || "Tell me more"}
    </button>
  );
}

function EpisodeChatPanel({ podcastSlug, episodeSlug, episodeTitle, podcastName }: {
  podcastSlug: string;
  episodeSlug: string;
  episodeTitle: string;
  podcastName: string;
}, ref: React.Ref<ChatContextRef>) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentEntity, setCurrentEntity] = useState<{ name: string; type: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const openChat = (entityName?: string, entityType?: string, initialQuestion?: string) => {
    const newEntity = entityName && entityType ? { name: entityName, type: entityType } : null;
    const entityChanged = newEntity && (!currentEntity || currentEntity.name !== newEntity.name || currentEntity.type !== newEntity.type);
    if (entityChanged || initialQuestion || !entityName) {
      setMessages([]);
      setInput("");
    }
    if (newEntity) {
      setCurrentEntity(newEntity);
    } else if (!entityName) {
      setCurrentEntity(null);
    }
    setIsOpen(true);
    if (initialQuestion) {
      setTimeout(() => sendMessage(initialQuestion, entityName, entityType, true), 150);
    }
  };

  React.useImperativeHandle(ref, () => ({ open: openChat }));

  const sendMessage = async (text?: string, overrideEntityName?: string, overrideEntityType?: string, freshConversation?: boolean) => {
    const q = text || input.trim();
    if (!q || loading) return;
    setInput("");
    const userMsg: ChatMessage = { role: "user", content: q };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    const eName = overrideEntityName || currentEntity?.name;
    const eType = overrideEntityType || currentEntity?.type;

    try {
      const resp = await fetch("/api/episode-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          podcastSlug,
          episodeSlug,
          entityName: eName || undefined,
          entityType: eType || undefined,
          question: q,
          conversationHistory: freshConversation ? [] : messages,
        }),
      });
      const data = await resp.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.answer || "Sorry, I couldn't respond." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const defaultSuggestions = [
    `What's the main thesis of this episode?`,
    `What was the most surprising insight?`,
    `Summarize the key takeaways in simple terms`,
  ];

  const entitySuggestions = currentEntity
    ? currentEntity.type === "person"
      ? [`What did they say about ${currentEntity.name}?`, `Why was ${currentEntity.name} mentioned?`]
      : currentEntity.type === "company"
      ? [`What was said about ${currentEntity.name}?`, `Why was ${currentEntity.name} discussed?`]
      : currentEntity.type === "book"
      ? [`What did they say about "${currentEntity.name}"?`, `Why was this book recommended?`]
      : currentEntity.type === "insight"
      ? [`Expand on this takeaway`, `What evidence supports this insight?`]
      : [`Tell me more about ${currentEntity.name}`, `Why is ${currentEntity.name} relevant?`]
    : defaultSuggestions;

  const clearEntity = () => {
    setCurrentEntity(null);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => { setCurrentEntity(null); setMessages([]); setInput(""); setIsOpen(true); }}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:scale-105 transition-all"
        data-testid="open-ai-chat-fab"
      >
        <Sparkles className="w-4 h-4" />
        <span className="text-[16px] font-semibold">Ask AI about this episode</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-background shadow-2xl shadow-black/[0.12] flex flex-col overflow-hidden" data-testid="ai-chat-panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08] bg-primary/[0.03]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold text-foreground truncate">Ask about this episode</p>
            {currentEntity && (
              <div className="flex items-center gap-1.5">
                <p className="text-[16px] text-primary truncate">Focused on: {currentEntity.name}</p>
                <button onClick={clearEntity} className="text-[#52525B] hover:text-muted-foreground shrink-0"><X className="w-3 h-3" /></button>
              </div>
            )}
          </div>
        </div>
        <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0" data-testid="close-ai-chat">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 max-h-[360px] overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-[16px] text-muted-foreground">{currentEntity ? `Ask anything about ${currentEntity.name}:` : "What would you like to know?"}</p>
            {entitySuggestions.map((q, i) => (
              <button
                key={i}
                onClick={() => sendMessage(q)}
                className="block w-full text-left text-[16px] px-3 py-2.5 rounded-xl border border-black/[0.04] dark:border-white/[0.06] hover:bg-primary/[0.04] hover:border-primary/20 text-foreground transition-all"
                data-testid={`suggested-question-${i}`}
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[16px] leading-relaxed ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-foreground"
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-3.5 py-3 bg-muted/50">
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-3 py-2.5 border-t border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex items-center gap-2 bg-muted/30 rounded-xl px-3 py-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
            placeholder="Ask anything about this episode..."
            className="flex-1 bg-transparent text-[16px] text-foreground placeholder:text-[#52525B] outline-none"
            data-testid="ai-chat-input"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className={`p-1.5 rounded-lg transition-all ${input.trim() && !loading ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground/30"}`}
            data-testid="ai-chat-send"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

const EpisodeChatPanelWithRef = React.forwardRef(EpisodeChatPanel);

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
                className="inline-flex items-center gap-1 text-[16px] font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
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
                <span className="text-[16px] font-bold text-teal-700 dark:text-teal-300 tracking-wide font-mono">{sponsor.couponCode}</span>
              </div>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 text-[16px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                data-testid={`sponsor-copy-${index}`}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-teal-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy code"}
              </button>
            </div>
          )}
          {sponsor.howToRedeem && (
            <p className="text-[16px] text-[#3F3F46] mt-2 leading-relaxed" data-testid={`sponsor-redeem-${index}`}>
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
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors text-[16px] font-medium text-muted-foreground"
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
  const personMatch = useMemo(() => {
    const name = quote.speakerName?.toLowerCase().trim();
    if (!name) return null;
    return PEOPLE_DIRECTORY.find(p =>
      p.name.toLowerCase().trim() === name ||
      p.searchTerms.some(t => t.toLowerCase().trim() === name)
    );
  }, [quote.speakerName]);

  return (
    <div
      className="relative w-full max-w-[85%] bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm"
      data-testid={`quote-card-${index}`}
    >
      <div className="px-6 py-5">
        <blockquote className="text-[16px] leading-[1.8] font-medium text-foreground mb-4" data-testid={`quote-text-${index}`}>
          <span className="text-primary/40 text-2xl mr-1">{"\u201C"}</span>
          {quote.quoteText}
          <span className="text-primary/40 text-2xl ml-1">{"\u201D"}</span>
        </blockquote>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3" data-testid={`quote-speaker-${index}`}>
            {personMatch ? (
              <img
                src={personMatch.imageUrl}
                alt={quote.speakerName}
                className="w-8 h-8 rounded-full object-cover flex-shrink-0 bg-muted"
                loading="lazy"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/[0.08] flex items-center justify-center flex-shrink-0">
                <span className="text-[16px] font-bold text-primary">{quote.speakerName.charAt(0)}</span>
              </div>
            )}
            <div>
              <p className="text-[16px] font-bold text-foreground">{quote.speakerName}</p>
              {quote.speakerRole && <p className="text-[16px] text-muted-foreground">{quote.speakerRole}</p>}
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
  const [activeSection, setActiveSection] = useState("section-key-insights");
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [showAllBooks, setShowAllBooks] = useState(false);
  const chatRef = useRef<ChatContextRef | null>(null);

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

  const { data: bookSlugMap = {} } = useQuery<Record<string, { slug: string; rating: number | null; pageCount: number | null; publishYear: number | null; asin: string | null; description: string | null; author: string | null; googleBooksId: string | null }>>({
    queryKey: ["/api/book-slugs"],
    queryFn: async () => {
      const res = await fetch("/api/book-slugs");
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 1000 * 60 * 60,
  });

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

  const getPersonSlug = useMemo(() => {
    const nameMap = new Map<string, string>();
    for (const p of PEOPLE_DIRECTORY) {
      nameMap.set(p.name.toLowerCase().trim(), p.slug);
      for (const term of p.searchTerms) {
        nameMap.set(term.toLowerCase().trim(), p.slug);
      }
    }
    return (name: string): string | null => {
      if (!name) return null;
      return nameMap.get(name.toLowerCase().trim()) || null;
    };
  }, []);

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
    const truncateAtWord = (s: string, max: number) => {
      if (s.length <= max) return s;
      const t = s.slice(0, max);
      const sp = t.lastIndexOf(" ");
      return (sp < max * 0.6 ? t : t.slice(0, sp)) + "...";
    };
    const pageDescription = truncateAtWord(episode.tldl, 150);
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
    };
  }, [episode, podcastSlug, episodeSlug]);

  useEffect(() => {
    const sectionIds = [
      "section-key-insights",
      "section-what-happened",
      "section-guests",
      "section-mentions",
      "section-books",
      "section-top-questions",
      "section-quotes",
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

  const hasTopQuestions = topQuestions.length > 0;
  const hasBooks = books.length > 0;
  const INITIAL_SHOW = 6;
  const hasSponsors = sponsors.length > 0;
  const hasQuotes = episodeQuotes.length > 0;

  const guestNames = (() => {
    if (guests.length === 0) return null;
    if (guests.length === 1) return guests[0].name;
    if (guests.length === 2) return `${guests[0].name} and ${guests[1].name}`;
    return `${guests[0].name}, ${guests[1].name}, and More`;
  })();
  const guestLabel = guestNames ? `${guestNames} on ${episode.podcastName}` : null;
  const seoSubject = guestLabel || `This ${episode.podcastName} Episode`;

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
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[16px] text-muted-foreground" data-testid="breadcrumb-nav">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/podcasts" className="hover:text-foreground transition-colors">Podcasts</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href={`/podcasts/${podcastSlug}`} className="hover:text-foreground transition-colors">{episode.podcastName}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium truncate max-w-[200px]">{episode.episodeTitle}</span>
        </nav>

        <nav className="sticky top-[56px] z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2.5 bg-background/90 backdrop-blur-md border-b border-black/[0.06] flex items-center gap-2 overflow-x-auto hide-scrollbar" data-testid="nav-in-page">
          {episode.keyInsights?.length > 0 && (
            <button
              onClick={() => scrollTo("section-key-insights")}
              className={`px-4 py-2.5 text-[16px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-key-insights" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-key-insights"
            >
              Takeaways
            </button>
          )}
          <button
            onClick={() => scrollTo("section-what-happened")}
            className={`px-4 py-2.5 text-[16px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-what-happened" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
            data-testid="nav-what-happened"
          >
            Recap
          </button>
          {(guests.length > 0 || hasHosts) && (
            <button
              onClick={() => scrollTo("section-guests")}
              className={`px-4 py-2.5 text-[16px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-guests" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-people"
            >
              Participants
            </button>
          )}
          {(notablePeople.length > 0 || notableCompanies.length > 0) && (
            <button
              onClick={() => scrollTo("section-mentions")}
              className={`px-4 py-2.5 text-[16px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-mentions" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-mentions"
            >
              Mentions
            </button>
          )}
          {hasBooks && (
            <button
              onClick={() => scrollTo("section-books")}
              className={`px-4 py-2.5 text-[16px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-books" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-books"
            >
              Books
            </button>
          )}
          {/* Sponsors nav chip — disabled for now, enable when podcaster promotion tools go public */}
          {hasTopQuestions && (
            <button
              onClick={() => scrollTo("section-top-questions")}
              className={`px-4 py-2.5 text-[16px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-top-questions" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-top-questions"
            >
              Q&A
            </button>
          )}
          {hasQuotes && (
            <button
              onClick={() => scrollTo("section-quotes")}
              className={`px-4 py-2.5 text-[16px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-quotes" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-quotes"
            >
              Quotes
            </button>
          )}
        </nav>

        <section className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-about-episode">
          <div className="px-6 py-4 bg-slate-500/[0.04] border-b border-slate-500/[0.08]">
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-4 h-4 text-slate-500" />
              <span className="text-base font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">About This Episode</span>
            </div>
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
                <span className="text-base font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                  {`Key Takeaways from ${seoSubject}`}
                </span>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3">
              {episode.keyInsights.map((insight: string, i: number) => (
                <div
                  key={i}
                  className="flex gap-3.5 items-start group/insight"
                  data-testid={`insight-${i}`}
                >
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 text-[16px] font-bold">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-base leading-[1.8] text-muted-foreground">{insight.replace(/\[([^\]]+)\]/g, '$1')}</p>
                    <div className="mt-1 opacity-60 group-hover/insight:opacity-100 transition-opacity">
                      <DeepDiveButton entityName={insight.slice(0, 80)} entityType="insight" chatRef={chatRef} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section id="section-what-happened" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-what-happened">
          <div className="px-6 py-4 bg-primary/[0.04] border-b border-primary/[0.08]">
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-4 h-4 text-primary" />
              <span className="text-base font-bold text-primary uppercase tracking-wider">{`Full Episode Recap: ${seoSubject}`}</span>
            </div>
          </div>
          <div className="px-6 py-5 space-y-5">
            {whatHappenedParagraphs.map((paragraph: string, i: number) => (
              <p key={i} className="text-[17px] leading-[1.85] text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </div>
        </section>

        {(guests.length > 0 || (hasHosts && podcastHosts)) && (
          <section id="section-guests" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-guests">
            <div className="px-6 py-4 bg-sky-500/[0.04] border-b border-sky-500/[0.08]">
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-sky-500" />
                <span className="text-base font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider">{`Who's in This Episode of ${episode.podcastName}`}</span>
              </div>
            </div>
            <div className="px-6 py-5">

              {guests.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-base font-bold text-muted-foreground uppercase tracking-wider mb-4" data-testid="participants-guest-label">{guests.length > 1 ? "Guests" : "Guest"}</h3>
                  <div className="space-y-5">
                    {guests.map((guest, i) => {
                      const personSlug = getPersonSlug(guest.name);
                      return (
                      <div key={i} className="flex items-start gap-4" data-testid={`guest-card-${i}`}>
                        {personSlug ? (
                          <Link href={`/people/${personSlug}`} className="flex-shrink-0">
                            <GuestPhoto name={guest.name} photoUrl={guest.photoUrl} testId={`guest-photo-${i}`} />
                          </Link>
                        ) : (
                          <GuestPhoto name={guest.name} photoUrl={guest.photoUrl} testId={`guest-photo-${i}`} />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[17px] font-bold text-foreground" data-testid={`guest-name-${i}`}>
                            {personSlug ? (
                              <Link href={`/people/${personSlug}`} className="hover:text-primary transition-colors" data-testid={`guest-link-${i}`}>
                                {guest.name}
                              </Link>
                            ) : guest.name}
                          </h4>
                          <p className="text-[16px] leading-[1.8] text-muted-foreground mt-1">
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
                      );
                    })}
                  </div>
                </div>
              )}

              {hasHosts && podcastHosts && (
                <div>
                  <h3 className="text-base font-bold text-muted-foreground uppercase tracking-wider mb-4" data-testid="participants-hosts-label">Hosts</h3>
                  <div className="space-y-5">
                    {podcastHosts.map((host: any, i: number) => {
                      const hostPersonSlug = getPersonSlug(host.name);
                      const hostPhoto = host.photoUrl ? (
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
                      );
                      return (
                      <div key={i} className="flex items-start gap-4" data-testid={`host-card-${i}`}>
                        {hostPersonSlug ? (
                          <Link href={`/people/${hostPersonSlug}`} className="flex-shrink-0">
                            {hostPhoto}
                          </Link>
                        ) : hostPhoto}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[17px] font-bold text-foreground" data-testid={`host-name-${i}`}>
                            {hostPersonSlug ? (
                              <Link href={`/people/${hostPersonSlug}`} className="hover:text-primary transition-colors" data-testid={`host-link-${i}`}>
                                {host.name}
                              </Link>
                            ) : host.name}
                          </h4>
                          {host.bio && (
                            <p className="text-[16px] leading-[1.8] text-muted-foreground mt-1">{host.bio.replace(/<[^>]*>/g, "").split("\n")[0]}</p>
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
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {(notablePeople.length > 0 || notableCompanies.length > 0) && (
          <section id="section-mentions" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-mentions">
            <div className="px-6 py-4 bg-orange-500/[0.04] border-b border-orange-500/[0.08]">
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-orange-500" />
                <h2 className="text-base font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider m-0">{`Top Mentions in This ${episode.podcastName} Episode`}</h2>
              </div>
            </div>
            <div className="px-6 py-5 space-y-8">
              {notablePeople.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="w-3.5 h-3.5 text-orange-500" />
                    <h3 className="text-[16px] font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider m-0">People</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(showAllPeople ? notablePeople : notablePeople.slice(0, INITIAL_SHOW)).map((person, i) => (
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
                          <DeepDiveButton entityName={person.name} entityType="person" chatRef={chatRef} podcastName={episode?.podcastName} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {notablePeople.length > INITIAL_SHOW && (
                    <button onClick={() => setShowAllPeople(p => !p)} className="mt-4 text-[16px] font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors" data-testid="show-more-people">
                      {showAllPeople ? "Show Less" : `Show ${notablePeople.length - INITIAL_SHOW} More`}
                    </button>
                  )}
                </div>
              )}

              {notablePeople.length > 0 && notableCompanies.length > 0 && (
                <hr className="border-black/[0.06] dark:border-white/[0.08]" />
              )}

              {notableCompanies.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="w-3.5 h-3.5 text-blue-500" />
                    <h3 className="text-[16px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider m-0">Companies</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(showAllCompanies ? notableCompanies : notableCompanies.slice(0, INITIAL_SHOW)).map((company, i) => (
                      <div key={company.slug} className="group/card rounded-xl border border-black/[0.06] dark:border-white/[0.08] hover:border-blue-500/30 bg-black/[0.01] dark:bg-white/[0.02] hover:bg-blue-500/[0.03] transition-all" data-testid={`notable-company-${i}`}>
                        <Link href={`/companies/${company.slug}`}>
                          <div className="flex items-center gap-3.5 px-4 pt-4 pb-2.5 cursor-pointer">
                            <img
                              src={company.logoUrl}
                              alt={company.name}
                              className="w-[72px] h-[72px] sm:w-24 sm:h-24 rounded-lg object-contain flex-shrink-0 bg-muted p-2 ring-2 ring-black/[0.04] dark:ring-white/[0.08]"
                              loading="lazy"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-bold text-foreground group-hover/card:text-blue-600 dark:group-hover/card:text-blue-400 transition-colors truncate">{company.name}</p>
                              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]/80 truncate mt-0.5">{company.details.industry}</p>
                            </div>
                          </div>
                        </Link>
                        <div className="px-4 pb-3.5">
                          {entityContexts[company.slug] && (
                            <p className="text-base leading-relaxed text-muted-foreground mb-2.5">{entityContexts[company.slug]}</p>
                          )}
                          <DeepDiveButton entityName={company.name} entityType="company" chatRef={chatRef} podcastName={episode?.podcastName} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {notableCompanies.length > INITIAL_SHOW && (
                    <button onClick={() => setShowAllCompanies(c => !c)} className="mt-4 text-[16px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors" data-testid="show-more-companies">
                      {showAllCompanies ? "Show Less" : `Show ${notableCompanies.length - INITIAL_SHOW} More`}
                    </button>
                  )}
                </div>
              )}
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
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(showAllBooks ? books : books.slice(0, INITIAL_SHOW)).map((book, i) => {
                  const bookKey = book.name.toLowerCase().trim();
                  const enrichment = bookSlugMap[bookKey];
                  const bookSlug = enrichment?.slug;
                  const asin = enrichment?.asin || extractAsin(book.url || "");
                  const blinkistUrl = getBlinkistUrl(book);
                  const displayAuthor = enrichment?.author || book.author;
                  const displayDescription = book.context || enrichment?.description;

                  return (
                    <div
                      key={i}
                      className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-5 hover:border-amber-500/[0.15] hover:shadow-md hover:shadow-black/[0.03] transition-all flex flex-col"
                      data-testid={`book-card-${i}`}
                    >
                      <div className="flex gap-4">
                        {bookSlug ? (
                          <Link href={`/bookstore/${bookSlug}`} className="shrink-0" data-testid={`book-cover-link-${i}`}>
                            <BookCover title={book.name} asin={asin} slug={bookSlug} googleBooksId={enrichment?.googleBooksId} testId={`book-cover-${i}`} />
                          </Link>
                        ) : (
                          <BookCover title={book.name} asin={asin} slug={bookSlug} googleBooksId={enrichment?.googleBooksId} testId={`book-cover-${i}`} />
                        )}
                        <div className="flex-1 min-w-0">
                          {bookSlug ? (
                            <Link href={`/bookstore/${bookSlug}`} className="text-[16px] font-bold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors leading-snug" data-testid={`book-title-${i}`}>
                              {book.name}
                            </Link>
                          ) : (
                            <h3 className="text-[16px] font-bold text-foreground leading-snug" data-testid={`book-title-${i}`}>
                              {book.name}
                            </h3>
                          )}
                          {displayAuthor && displayAuthor !== "null" && (
                            <p className="text-[16px] text-muted-foreground mt-0.5" data-testid={`book-author-${i}`}>
                              by {displayAuthor}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            {enrichment?.rating && (
                              <span className="inline-flex items-center gap-0.5 text-[16px] font-semibold text-amber-600 dark:text-amber-400">
                                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                {enrichment.rating.toFixed(1)}
                              </span>
                            )}
                            {enrichment?.pageCount && (
                              <span className="text-[16px] text-muted-foreground">{enrichment.pageCount}p</span>
                            )}
                            {enrichment?.publishYear && (
                              <span className="text-[16px] text-muted-foreground">{enrichment.publishYear}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {displayDescription && (
                        <p className="text-[16px] text-muted-foreground leading-relaxed mt-3" data-testid={`book-context-${i}`}>
                          {displayDescription.length > 180 ? displayDescription.slice(0, 180).replace(/\s+\S*$/, "") + "." : displayDescription}
                        </p>
                      )}

                      <div className="mt-auto pt-3">
                        <DeepDiveButton entityName={book.name} entityType="book" chatRef={chatRef} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {books.length > INITIAL_SHOW && (
                <button onClick={() => setShowAllBooks(b => !b)} className="mt-4 text-[16px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors" data-testid="show-more-books">
                  {showAllBooks ? "Show Less" : `Show ${books.length - INITIAL_SHOW} More`}
                </button>
              )}
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
                  <h2 className="text-base font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wider m-0">{guestNames ? `Key Questions Answered in This Episode with ${guestNames}` : `Key Questions Answered in This ${episode.podcastName} Episode`}</h2>
                </div>
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
                <div className="px-0 pt-3 pb-1 border-t border-black/[0.04] dark:border-white/[0.06] mt-2">
                  <button
                    onClick={() => chatRef.current?.open()}
                    className="inline-flex items-center gap-1.5 text-[16px] font-medium text-primary/80 hover:text-primary transition-colors"
                    data-testid="ask-custom-question"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Have a different question? Ask AI
                  </button>
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

        {hasQuotes && (
          <section id="section-quotes" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-quotes">
            <div className="px-6 py-4 bg-violet-500/[0.04] border-b border-violet-500/[0.08]">
              <div className="flex items-center gap-2.5">
                <Quote className="w-4 h-4 text-violet-500" />
                <span className="text-base font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wider">{guestNames ? `Best ${guestNames} Quotes from ${episode.podcastName}` : `Best Quotes from ${seoSubject}`}</span>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="flex flex-col items-end space-y-4">
                {episodeQuotes.slice(0, 3).map((q, i) => (
                  <QuoteCard
                    key={q.id}
                    quote={q}
                    podcastName={episode.podcastName}
                    episodeTitle={episode.episodeTitle}
                    index={i}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

      </motion.article>

      <EpisodeChatPanelWithRef
        ref={chatRef}
        podcastSlug={podcastSlug}
        episodeSlug={episodeSlug}
        episodeTitle={episode?.episodeTitle || ""}
        podcastName={episode?.podcastName || ""}
      />
    </EpisodePageLayout>
  );
}
