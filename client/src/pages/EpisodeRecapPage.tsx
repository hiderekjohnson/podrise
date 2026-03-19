import { useParams } from "wouter";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Lightbulb, Loader2, Sparkles, BookOpen, Globe, Users, Building2, ChevronRight, Megaphone, ExternalLink, Ticket, Copy, Check, Quote, X, ArrowUp, Clock, ShoppingBag, Bookmark, BookmarkCheck, Heart, ListChecks, ArrowRight } from "lucide-react";
import { BookCover as SharedBookCover } from "@/components/BookCover";
import { PodcastMicBadge } from "@/components/PodcastMicBadge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { SiX, SiLinkedin, SiInstagram } from "react-icons/si";
import { getPodcastBySlug, type PodcastLandingConfig } from "../data/podcastLandingData";
import { PEOPLE_DIRECTORY, COMPANIES_DIRECTORY } from "../data/entityDirectoryData";
import { Link, useLocation } from "wouter";
import { GetRecapsModal } from "@/components/GetRecapsModal";
import { FeedStyleCard, FeedStyleCardHeader, FeedStyleCardSection } from "@/components/FeedStyleCard";
import { RecapCard } from "@/components/RecapCard";
import { PodcastPageLayout } from "@/components/PodcastPageLayout";
import { EpisodeCard } from "@/components/EpisodeCard";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth, useRegister } from "@/hooks/use-auth";
import { useSetConversion } from "@/contexts/PageConversionContext";

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

function BookCover({ title, slug, googleBooksId, isbn, hasCover, testId }: { title: string; asin?: string | null; slug?: string | null; author?: string | null; googleBooksId?: string | null; isbn?: string | null; hasCover?: boolean | null; testId: string }) {
  return (
    <SharedBookCover
      title={title}
      slug={slug}
      googleBooksId={googleBooksId}
      isbn={isbn}
      hasCover={hasCover}
      size="sm"
      className="w-16 h-24 sm:w-20 sm:h-[120px] rounded-lg object-cover shrink-0 shadow-sm border border-black/[0.06]"
      testId={testId}
    />
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
    : [];

  const clearEntity = () => {
    setCurrentEntity(null);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => { setCurrentEntity(null); setMessages([]); setInput(""); setIsOpen(true); }}
        className="fixed bottom-[calc(60px+env(safe-area-inset-bottom,0px))] right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:scale-105 transition-all md:bottom-4"
        data-testid="open-ai-chat-fab"
      >
        <Sparkles className="w-4 h-4" />
        <span className="hidden sm:inline text-[16px] font-semibold">Ask AI about this episode</span>
        <span className="sm:hidden text-[16px] font-semibold">Ask AI</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-[calc(50px+env(safe-area-inset-bottom,0px))] md:bottom-0 right-0 sm:bottom-6 sm:right-6 z-50 w-full sm:w-[380px] sm:max-w-[calc(100vw-2rem)] rounded-t-2xl sm:rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-background shadow-2xl shadow-black/[0.12] flex flex-col overflow-hidden max-h-[70vh] sm:max-h-none" data-testid="ai-chat-panel">
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
            <p className="text-[16px] text-[#52525B] mt-2 leading-relaxed" data-testid={`sponsor-redeem-${index}`}>
              {sponsor.howToRedeem}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function QuoteShareBar({ quote, podcastName, episodeTitle }: { quote: EpisodeQuoteData; podcastName: string; episodeTitle: string }) {
  const shareText = `"${quote.quoteText}" - ${quote.speakerName}${quote.speakerRole ? `, ${quote.speakerRole}` : ""}\n\nFrom ${podcastName}: ${episodeTitle}\nvia @podrise_hq`;
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
      className="relative w-full bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm flex flex-col"
      data-testid={`quote-card-${index}`}
    >
      <div className="px-5 py-5 flex flex-col flex-1">
        <blockquote className="text-[16px] leading-[1.8] font-medium text-foreground mb-4 flex-1" data-testid={`quote-text-${index}`}>
          <span className="text-primary/40 text-2xl mr-1">{"\u201C"}</span>
          {quote.quoteText}
          <span className="text-primary/40 text-2xl ml-1">{"\u201D"}</span>
        </blockquote>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-black/[0.04] dark:border-white/[0.06]">
          <div className="flex items-center gap-3 min-w-0" data-testid={`quote-speaker-${index}`}>
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
            <div className="min-w-0">
              <p className="text-[16px] font-bold text-foreground truncate">{quote.speakerName}</p>
              {quote.speakerRole && <p className="text-[14px] text-muted-foreground truncate">{quote.speakerRole}</p>}
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
  const [, navigate] = useLocation();
  const [activeSection, setActiveSection] = useState("section-key-insights");
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [showAllBooks, setShowAllBooks] = useState(false);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const chatRef = useRef<ChatContextRef | null>(null);
  const { toast } = useToast();
  const { data: authUser } = useAuth();
  const registerMutation = useRegister();
  const [showUpdatesModal, setShowUpdatesModal] = useState(false);
  const [ctaEmail, setCtaEmail] = useState("");

  const { data: bookmarksData } = useQuery<{ id: number; episodeSlug: string; podcastSlug: string }[]>({
    queryKey: ["/api/bookmarks"],
    enabled: !!authUser,
  });
  const isBookmarked = (bookmarksData || []).some(b => b.episodeSlug === episodeSlug && b.podcastSlug === podcastSlug);

  const addBookmarkMut = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/bookmarks", { episodeSlug, podcastSlug }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] }); },
  });
  const removeBookmarkMut = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/bookmarks/${encodeURIComponent(podcastSlug)}/${encodeURIComponent(episodeSlug)}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] }); },
  });
  const genericAddBookmark = useMutation({
    mutationFn: async ({ episodeSlug: es, podcastSlug: ps }: { episodeSlug: string; podcastSlug: string }) => {
      await apiRequest("POST", "/api/bookmarks", { episodeSlug: es, podcastSlug: ps });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] }); },
  });
  const genericRemoveBookmark = useMutation({
    mutationFn: async ({ episodeSlug: es, podcastSlug: ps }: { episodeSlug: string; podcastSlug: string }) => {
      await apiRequest("DELETE", `/api/bookmarks/${encodeURIComponent(ps)}/${encodeURIComponent(es)}`);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] }); },
  });

  const { data: followData } = useQuery<{ followedSlugs: string[] }>({
    queryKey: ["/api/feed/followed-slugs"],
    enabled: !!authUser,
  });
  const isFollowing = followData?.followedSlugs?.includes(podcastSlug) ?? false;

  const followMutation = useMutation({
    mutationFn: async ({ follow }: { follow: boolean }) => {
      const endpoint = follow ? "/api/feed/follow" : "/api/feed/unfollow";
      await apiRequest("POST", endpoint, { podcastSlug });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-slugs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update subscription", variant: "destructive" });
    },
  });

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

  const { data: approvedProducts } = useQuery<{ products: any[] }>({
    queryKey: ["/api/podcasts", podcastSlug, "episode-products", episodeSlug],
    enabled: !!podcastSlug && !!episodeSlug,
  });

  const { data: bookSlugMap = {} } = useQuery<Record<string, { slug: string; rating: number | null; pageCount: number | null; publishYear: number | null; asin: string | null; description: string | null; author: string | null; googleBooksId: string | null; podcastCount: number | null }>>({
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

  const staticConfig = getPodcastBySlug(podcastSlug);
  const podcastConfig: PodcastLandingConfig | undefined = staticConfig || (episode ? {
    slug: podcastSlug,
    name: episode.podcastName || podcastSlug,
    itunesId: episode.itunesId || "",
    category: "",
    hosts: episode.hosts || "",
    description: "",
    keywords: "",
    faqTopics: "",
    artworkUrl: episode.artworkUrl || "",
    appleUrl: "",
    spotifyUrl: "",
  } : undefined);

  const epHostNames = podcastConfig?.hosts
    ? podcastConfig.hosts.split(/,\s*|&\s*|\sand\s/i).map((h: string) => h.trim()).filter(Boolean)
    : [];

  useSetConversion({
    pageType: "episode",
    name: episode?.episodeTitle || "",
    slug: episodeSlug,
    podcastName: episode?.podcastName || "",
    podcastSlug,
    artworkUrl: episode?.artworkUrl || "",
    hosts: epHostNames,
  });

  const handleCtaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ctaEmail.trim() || !/^\S+@\S+\.\S+$/.test(ctaEmail)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    if (!podcastConfig) return;
    registerMutation.mutate(
      {
        podcasts: [JSON.stringify({ id: podcastConfig.itunesId, name: podcastConfig.name, artworkUrl: podcastConfig.artworkUrl || "" })],
        email: ctaEmail.trim(),
      },
      {
        onSuccess: () => navigate("/dashboard?welcome=true"),
        onError: (err: any) => {
          toast({
            title: "Something went wrong",
            description: err.message?.includes("400") ? "This email is already registered. Try logging in." : "Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

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
      document.title = "Episode Not Found | PodRise";
      return;
    }

    const pageTitle = `${episode.episodeTitle} — ${episode.podcastName} Summary & Key Takeaways | PodRise`;
    const truncateAtWord = (s: string, max: number) => {
      if (s.length <= max) return s;
      const t = s.slice(0, max);
      const sp = t.lastIndexOf(" ");
      return (sp < max * 0.6 ? t : t.slice(0, sp)) + "...";
    };
    const pageDescription = truncateAtWord(episode.tldl, 150);
    const canonicalUrl = `https://podrise.com/podcasts/${podcastSlug}/${episodeSlug}`;

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
    setMeta('meta[name="twitter:card"]', "content", "summary_large_image");
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
      document.title = "PodRise | Daily Podcast Recaps from Your Favorite Shows";
    };
  }, [episode, podcastSlug, episodeSlug]);

  useEffect(() => {
    const sectionIds = [
      "section-key-insights",
      "section-what-happened",
      "section-guests",
      "section-mentions",
      "section-shop",
      "section-quotes",
    ];

    const handleScroll = () => {
      const offset = (authUser ? 0 : 120) + 52 + 40;
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
  }, [episode, authUser]);


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
  let books: BookResource[] = [];
  try {
    const allResources: BookResource[] = episode.resources ? (typeof episode.resources === "string" ? JSON.parse(episode.resources) : episode.resources) : [];
    books = allResources.filter(r => r.type === "book" && r.name && r.name !== '_books_checked')
      .filter(r => {
        const key = r.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
        return !!bookSlugMap[key]?.slug;
      });
  } catch { books = []; }

  const shopProducts = approvedProducts?.products || [];

  let sponsors: Sponsor[] = [];
  try {
    const raw = episode.sponsors;
    if (raw) {
      sponsors = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!Array.isArray(sponsors)) sponsors = [];
      sponsors = sponsors.filter(s => s.name);
    }
  } catch { sponsors = []; }

  const hasBooks = books.length > 0;
  const hasShopProducts = shopProducts.length > 0;
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
    const headerHeight = authUser ? 0 : 120;
    const navHeight = 52;
    const offset = headerHeight + navHeight + 16;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const recapContent = (
      <motion.article
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="space-y-8"
      >
        {!authUser && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[16px] text-muted-foreground overflow-hidden" data-testid="breadcrumb-nav">
            <Link href="/" className="hover:text-foreground transition-colors shrink-0 hidden sm:inline">Home</Link>
            <ChevronRight className="w-3 h-3 shrink-0 hidden sm:inline" />
            <Link href="/podcasts" className="hover:text-foreground transition-colors shrink-0 hidden sm:inline">Podcasts</Link>
            <ChevronRight className="w-3 h-3 shrink-0 hidden sm:inline" />
            <Link href={`/podcasts/${podcastSlug}`} className="hover:text-foreground transition-colors shrink-0 truncate max-w-[140px] sm:max-w-none">{episode.podcastName}</Link>
            <ChevronRight className="w-3 h-3 shrink-0" />
            <span className="text-foreground font-medium truncate min-w-0">{episode.episodeTitle}</span>
          </nav>
        )}

        {!authUser && (
          <nav className={`sticky z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2.5 bg-background/90 backdrop-blur-md border-b border-black/[0.06] flex items-center gap-2 overflow-x-auto hide-scrollbar top-[120px]`} data-testid="nav-in-page">
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
            {(hasBooks || hasShopProducts) && (
              <button
                onClick={() => scrollTo("section-shop")}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-[16px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-shop" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
                data-testid="nav-shop"
              >
                <ShoppingBag className="w-4 h-4" />
                Shop
                <span className="ml-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#6366F1]/10 text-[#6366F1] border border-[#6366F1]/20">Beta</span>
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
        )}

        <section id="section-what-happened" className="bg-white dark:bg-white/[0.03] border border-[#E4E4E7] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)]" data-testid="section-what-happened">
          <div className="px-5 sm:px-6 pt-5 pb-[18px] border-b border-[#F0F0F2] dark:border-white/[0.06]">
            <div className="flex items-center gap-2.5 mb-[9px]">
              <BookOpen className="w-4 h-4 text-primary shrink-0" />
              <span className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#A1A1AA]" style={{ fontFamily: "var(--font-mono)" }}>Episode Recap</span>
            </div>
            <h3 className="text-[26px] font-normal text-[#09090B] dark:text-white leading-[1.2] tracking-[-0.01em]" style={{ fontFamily: "var(--font-serif)" }}>
              {episode.tldl || seoSubject}
            </h3>
          </div>
          <div className="px-5 sm:px-6 py-[22px] space-y-5">
            {whatHappenedParagraphs.map((paragraph: string, i: number) => (
              <p key={i} className="text-[16px] leading-[1.6] text-[#52525B] dark:text-[#A1A1AA]">
                {paragraph}
              </p>
            ))}
          </div>
        </section>

        {(guests.length > 0 || (hasHosts && podcastHosts)) && (
          <section id="section-guests" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-guests">
            <div className="px-4 sm:px-6 py-4 bg-sky-500/[0.04] border-b border-sky-500/[0.08]">
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-sky-500 shrink-0" />
                <span className="text-base font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider">{`Who's in This Episode of ${episode.podcastName}`}</span>
              </div>
            </div>
            <div className="px-4 sm:px-6 py-5">
              <div className={`grid gap-8 ${guests.length > 0 && hasHosts && podcastHosts ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>

              {hasHosts && podcastHosts && (
                <div className={guests.length > 0 ? "order-2 md:order-1" : ""}>
                  <h3 className="text-base font-bold text-muted-foreground uppercase tracking-wider mb-4" data-testid="participants-hosts-label">Hosts</h3>
                  <div className="space-y-5">
                    {podcastHosts.map((host: any, i: number) => {
                      const hostPersonSlug = getPersonSlug(host.name);
                      return (
                      <div key={i} className="flex items-start gap-4" data-testid={`host-card-${i}`}>
                        {hostPersonSlug ? (
                          <Link href={`/people/${hostPersonSlug}`} className="flex-shrink-0">
                            <GuestPhoto name={host.name} photoUrl={host.photoUrl} testId={`host-photo-${i}`} />
                          </Link>
                        ) : (
                          <div className="flex-shrink-0">
                            <GuestPhoto name={host.name} photoUrl={host.photoUrl} testId={`host-photo-${i}`} />
                          </div>
                        )}
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

              {guests.length > 0 && (
                <div className={hasHosts && podcastHosts ? "order-1 md:order-2" : ""}>
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
                          <div className="flex-shrink-0">
                            <GuestPhoto name={guest.name} photoUrl={guest.photoUrl} testId={`guest-photo-${i}`} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[17px] font-bold text-foreground" data-testid={`guest-name-${i}`}>
                            {personSlug ? (
                              <Link href={`/people/${personSlug}`} className="hover:text-primary transition-colors" data-testid={`guest-link-${i}`}>
                                {guest.name}
                              </Link>
                            ) : guest.name}
                          </h4>
                          {(guest.title || guest.bio) && (
                            <p className="text-[16px] leading-[1.8] text-muted-foreground mt-1">
                              {guest.title ? guest.title + ". " : ""}{guest.bio || ""}
                            </p>
                          )}
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
                                <a href={guest.website.startsWith("http") ? guest.website : `https://${guest.website}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors" data-testid={`guest-website-${i}`} title="Website">
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
            </div>
          </section>
        )}

        {(notablePeople.length > 0 || notableCompanies.length > 0) && (
          <section id="section-mentions" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-mentions">
            <div className="px-4 sm:px-6 py-4 bg-orange-500/[0.04] border-b border-orange-500/[0.08]">
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-orange-500 shrink-0" />
                <h2 className="text-base font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider m-0">{`Top Mentions in This ${episode.podcastName} Episode`}</h2>
              </div>
            </div>
            <div className="px-4 sm:px-6 py-5 space-y-8">
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
                              <p className="text-base text-[#52525B] dark:text-[#A1A1AA]/80 truncate mt-0.5">{person.title}</p>
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
                              <p className="text-base text-[#52525B] dark:text-[#A1A1AA]/80 truncate mt-0.5">{company.details.industry}</p>
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



        {(hasBooks || hasShopProducts) && (
          <section id="section-shop" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-shop">
            <div className="px-4 sm:px-6 py-4 bg-[#6366F1]/[0.04] border-b border-[#6366F1]/[0.08]">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-4 h-4 text-[#6366F1] shrink-0" />
                <h2 className="text-base font-bold text-[#6366F1] dark:text-[#A5B4FC] uppercase tracking-wider m-0">Shop</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#6366F1]/10 text-[#6366F1] border border-[#6366F1]/20">Beta</span>
              </div>
            </div>
            <div className="px-4 sm:px-6 py-5">
              {hasBooks && (
              <>
              <div className="flex items-center gap-2.5 mb-5">
                <BookOpen className="w-4 h-4 text-amber-600 shrink-0" />
                <h3 className="text-base font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider m-0">Books Mentioned</h3>
              </div>
              <div className="flex flex-col gap-5">
                {(showAllBooks ? books : books.slice(0, INITIAL_SHOW)).map((book, i) => {
                  const bookKey = book.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
                  const enrichment = bookSlugMap[bookKey];
                  const bookSlug = enrichment?.slug;
                  const asin = enrichment?.asin || extractAsin(book.url || "");
                  const displayAuthor = enrichment?.author || book.author;
                  const bookContext = book.context && book.context.length > 20 ? book.context : null;
                  const fallbackDescription = enrichment?.description || book.description;

                  return (
                    <div
                      key={i}
                      className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-5 hover:border-amber-500/[0.15] hover:shadow-md hover:shadow-black/[0.03] transition-all"
                      data-testid={`book-card-${i}`}
                    >
                      <div className="flex gap-4">
                        {bookSlug ? (
                          <Link href={`/shop/${bookSlug}`} className="shrink-0" data-testid={`book-cover-link-${i}`}>
                            <BookCover title={book.name} asin={asin} slug={bookSlug} googleBooksId={enrichment?.googleBooksId} isbn={enrichment?.isbn} hasCover={enrichment?.hasCover} testId={`book-cover-${i}`} />
                          </Link>
                        ) : (
                          <BookCover title={book.name} asin={asin} slug={bookSlug} googleBooksId={enrichment?.googleBooksId} isbn={enrichment?.isbn} hasCover={enrichment?.hasCover} testId={`book-cover-${i}`} />
                        )}
                        <div className="flex-1 min-w-0">
                          {bookSlug ? (
                            <Link href={`/shop/${bookSlug}`} className="text-[16px] font-bold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors leading-snug" data-testid={`book-title-${i}`}>
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
                            {enrichment?.podcastCount && enrichment.podcastCount > 0 && (
                              <PodcastMicBadge count={enrichment.podcastCount} size="sm" />
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

                      {bookContext ? (
                        <div className="mt-3 pt-3 border-t border-amber-500/[0.08]">
                          <p className="text-[13px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1.5">Why they talked about it</p>
                          <div className="text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.85] [&_strong]:text-[#18181B] dark:[&_strong]:text-white [&_strong]:font-semibold" data-testid={`book-context-${i}`} dangerouslySetInnerHTML={{ __html: bookContext.replace(/<strong[^>]*>/gi, '<strong>').replace(/<(?!\/?strong>)[^>]*>/gi, '') }} />
                        </div>
                      ) : fallbackDescription ? (
                        <p className="text-[15px] text-muted-foreground leading-relaxed mt-3" data-testid={`book-context-${i}`}>
                          {fallbackDescription}
                        </p>
                      ) : null}

                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-black/[0.04] dark:border-white/[0.06]">
                        {bookSlug && (
                          <Link
                            href={`/shop/${bookSlug}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 transition-colors"
                            data-testid={`book-detail-link-${i}`}
                          >
                            See all podcast mentions
                            <ChevronRight className="w-3 h-3" />
                          </Link>
                        )}
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
            </>
            )}
            {hasShopProducts && (
              <div className="mt-8 pt-6 border-t border-black/[0.06] dark:border-white/[0.08]">
                <div className="flex items-center gap-2.5 mb-5">
                  <ShoppingBag className="w-4 h-4 text-emerald-600 shrink-0" />
                  <h3 className="text-base font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider m-0">Products & Tools Mentioned</h3>
                </div>
                <div className="flex flex-col gap-5">
                {(showAllProducts ? shopProducts : shopProducts.slice(0, INITIAL_SHOW)).map((product: any, i: number) => {
                  const typeLabel = product.type === "service_or_tool" ? "Tool" :
                    product.type === "physical_product" ? "Product" :
                    product.type === "software" ? "Software" :
                    product.type === "app" ? "App" :
                    product.type === "course" ? "Course" :
                    product.type === "newsletter" ? "Newsletter" : "Product";

                  const typeColor = ["service_or_tool", "software", "app"].includes(product.type)
                    ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                    : product.type === "course"
                    ? "bg-purple-500/10 text-purple-700 dark:text-purple-400"
                    : product.type === "newsletter"
                    ? "bg-orange-500/10 text-orange-700 dark:text-orange-400"
                    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";

                  const productContext = typeof product.context === "string" && product.context.length > 20 ? product.context : null;

                  return (
                    <div
                      key={i}
                      className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-5 hover:border-emerald-500/[0.15] hover:shadow-md hover:shadow-black/[0.03] transition-all"
                      data-testid={`product-card-${i}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/[0.08] flex items-center justify-center shrink-0">
                          <ShoppingBag className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-[16px] font-bold text-foreground leading-snug" data-testid={`product-name-${i}`}>
                              {product.name}
                            </h3>
                            <span className={`text-[11px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${typeColor}`}>
                              {typeLabel}
                            </span>
                          </div>
                          {product.company && product.company !== product.name && (
                            <p className="text-[14px] text-muted-foreground mt-0.5">by {product.company}</p>
                          )}
                          {product.description && (
                            <p className="text-[14px] text-muted-foreground leading-relaxed mt-1" data-testid={`product-desc-${i}`}>
                              {product.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {productContext && (
                        <div className="mt-3 pt-3 border-t border-emerald-500/[0.08]">
                          <p className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1.5">Why they recommended it</p>
                          <p className="text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.85] italic" data-testid={`product-context-${i}`}>
                            "{productContext.length > 400 ? productContext.slice(0, 400).replace(/\s+\S*$/, "") + "..." : productContext}"
                          </p>
                        </div>
                      )}

                      {product.url && (
                        <div className="mt-3 pt-3 border-t border-black/[0.04] dark:border-white/[0.06]">
                          <a
                            href={product.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${
                              product.isAmazon
                                ? "bg-[#FF9900] hover:bg-[#E88B00] text-[#0F1111]"
                                : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                            }`}
                            data-testid={`product-link-${i}`}
                          >
                            {product.isAmazon ? "View on Amazon" : "Visit Website"}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {shopProducts.length > INITIAL_SHOW && (
                <button onClick={() => setShowAllProducts(p => !p)} className="mt-4 text-[16px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors" data-testid="show-more-products">
                  {showAllProducts ? "Show Less" : `Show ${shopProducts.length - INITIAL_SHOW} More`}
                </button>
              )}
              </div>
            )}
            </div>
            <div className="px-4 sm:px-6 pb-4">
              <p className="text-[12px] text-[#A1A1AA] leading-relaxed" data-testid="affiliate-disclosure-shop">
                Some links are affiliate links — they help keep PodRise free. We only feature products recommended by podcasters, never random picks.{" "}
                <Link href="/disclosure" className="text-[#6366F1] hover:underline">Learn more</Link>
              </p>
            </div>
          </section>
        )}

        {hasQuotes && (
          <section id="section-quotes" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-quotes">
            <div className="px-4 sm:px-6 py-4 bg-violet-500/[0.04] border-b border-violet-500/[0.08]">
              <div className="flex items-center gap-2.5">
                <Quote className="w-4 h-4 text-violet-500 shrink-0" />
                <span className="text-base font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wider">{guestNames ? `Best ${guestNames} Quotes from ${episode.podcastName}` : `Best Quotes from ${seoSubject}`}</span>
              </div>
            </div>
            <div className="px-4 sm:px-6 py-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {episodeQuotes.slice(0, 4).map((q, i) => (
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
  );

  const metaItems = [];
  if (podcastConfig?.hosts) metaItems.push({ icon: "host" as const, text: podcastConfig.hosts });
  if (podcastConfig?.totalEpisodes) metaItems.push({ icon: "episodes" as const, text: `${podcastConfig.totalEpisodes}+ episodes` });
  if (podcastConfig?.yearStarted) metaItems.push({ icon: "since" as const, text: `Since ${podcastConfig.yearStarted}` });

  function relativeTime(dateStr: string): string {
    if (!dateStr) return "";
    const now = new Date();
    const date = new Date(dateStr + "T00:00:00");
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

  const currentIdx = allRecaps.findIndex((r: any) => r.episodeSlug === episodeSlug);
  const previousEpisodes = currentIdx >= 0 ? allRecaps.slice(currentIdx + 1, currentIdx + 6) : [];

  const firstQuote = episodeQuotes.length > 0 ? episodeQuotes[0] : null;

  const headerRightAction = authUser ? (
    <button
      onClick={() => followMutation.mutate({ follow: !isFollowing })}
      disabled={followMutation.isPending}
      className={`inline-flex items-center px-5 py-[7px] rounded-full text-[14px] font-bold transition-all ${
        isFollowing
          ? "bg-[#6366F1]/10 text-[#6366F1] hover:bg-red-50 hover:text-red-600"
          : "bg-[#6366F1] text-white hover:bg-[#4F46E5]"
      }`}
      data-testid="episode-card-follow-btn"
    >
      {isFollowing ? "Following" : "Follow"}
    </button>
  ) : (
    <button
      onClick={() => setShowUpdatesModal(true)}
      className="inline-flex items-center px-5 py-[7px] rounded-full text-[14px] font-bold transition-all bg-[#6366F1] text-white hover:bg-[#4F46E5]"
      data-testid="episode-card-get-recaps-btn"
    >
      Get Recaps
    </button>
  );

  const mainContent = (
    <div className={`px-4 md:px-6 py-6 ${authUser ? "pb-24 md:pb-8" : "pb-8"} ${!authUser ? "max-w-4xl mx-auto" : ""}`}>
      {authUser ? (
        <RecapCard
          id={`${podcastSlug}-${episodeSlug}`}
          podcastSlug={podcastSlug}
          episodeSlug={episodeSlug}
          podcastName={episode.podcastName}
          episodeTitle={episode.episodeTitle}
          publishDate={episode.publishDate}
          artworkUrl={episode.artworkUrl || podcastConfig?.artworkUrl || null}
          tldl={episode.tldl}
          tabloidSubHeadline={episode.tabloidSubHeadline}
          keyInsights={episode.keyInsights}
          quote={firstQuote?.quoteText || null}
          quoteAttribution={firstQuote?.speakerName ? `${firstQuote.speakerName}${firstQuote.speakerRole ? `, ${firstQuote.speakerRole}` : ""}` : null}
          duration={episode.duration}
          hosts={podcastConfig?.hosts}
          totalEpisodes={podcastConfig?.totalEpisodes}
          yearStarted={podcastConfig?.yearStarted}
          whatHappened={episode.whatHappened}
          spotifyEpisodeUrl={episode.spotifyEpisodeUrl}
          spotifyUrl={episode.spotifyUrl}
          youtubeUrl={episode.youtubeUrl}
          isFollowing={isFollowing}
          isBookmarked={isBookmarked}
          onFollowToggle={(slug, follow) => followMutation.mutate({ follow })}
          onBookmarkToggle={() => { if (isBookmarked) removeBookmarkMut.mutate(); else addBookmarkMut.mutate(); }}
          toast={toast}
          testIdPrefix="episode-card"
          className="mb-0"
        />
      ) : (
        <FeedStyleCard testId="episode-feed-card">
          <FeedStyleCardHeader
            imageUrl={episode.artworkUrl || podcastConfig?.artworkUrl || ""}
            imageAlt={episode.podcastName}
            imageLink={`/podcasts/${podcastSlug}`}
            name={episode.podcastName}
            nameLink={`/podcasts/${podcastSlug}`}
            meta={metaItems}
            tintSource={episode.artworkUrl || podcastSlug}
            testIdPrefix="episode-card"
            rightAction={headerRightAction}
          />
          <FeedStyleCardSection>
            <div className="flex items-baseline justify-between gap-3 mb-[9px]">
              <span className="text-[12px] text-[#A1A1AA] overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0" style={{ fontFamily: "var(--font-mono)" }} data-testid="episode-card-title">
                {episode.episodeTitle}
              </span>
              <span className="text-[12px] text-[#A1A1AA] whitespace-nowrap flex-shrink-0" style={{ fontFamily: "var(--font-mono)" }}>
                {relativeTime(episode.publishDate)}
              </span>
            </div>
            {episode.tldl && (
              <h3 className="text-[26px] font-normal text-[#09090B] dark:text-white leading-[1.2] tracking-[-0.01em]" style={{ fontFamily: "var(--font-serif)" }} data-testid="episode-card-headline">
                {episode.tldl}
              </h3>
            )}
          </FeedStyleCardSection>

          {episode.keyInsights?.length > 0 && (
            <FeedStyleCardSection>
              <div id="section-key-insights" data-testid="section-key-insights">
                <span className="text-[11px] font-medium tracking-[0.15em] uppercase text-[#A1A1AA] block mb-4" style={{ fontFamily: "var(--font-mono)" }}>
                  KEY TAKEAWAYS
                </span>
                <div className="space-y-4">
                  {episode.keyInsights.map((insight: string, i: number) => (
                    <div
                      key={i}
                      className="flex gap-3 items-start"
                      data-testid={`insight-${i}`}
                    >
                      <span className="w-[8px] h-[8px] rounded-full bg-[#6366F1] shrink-0 mt-[9px]" />
                      <p className="text-[15px] leading-[1.75] text-[#52525B] dark:text-[#A1A1AA] flex-1">{insight.replace(/\[([^\]]+)\]/g, '$1')}</p>
                    </div>
                  ))}
                </div>
              </div>
            </FeedStyleCardSection>
          )}

          {firstQuote && (
            <FeedStyleCardSection>
              <blockquote className="border-l-[3px] border-[#6366F1] pl-5 py-1" data-testid="inline-blockquote">
                <p className="text-[17px] leading-[1.7] text-[#09090B] dark:text-white italic" style={{ fontFamily: "var(--font-serif)" }}>
                  "{firstQuote.quoteText}"
                </p>
                {firstQuote.speakerName && (
                  <cite className="text-[13px] text-[#A1A1AA] not-italic mt-2 block">
                    — {firstQuote.speakerName}{firstQuote.speakerRole ? `, ${firstQuote.speakerRole}` : ""}
                  </cite>
                )}
              </blockquote>
            </FeedStyleCardSection>
          )}
        </FeedStyleCard>
      )}

      {!authUser && (
        <div className="mt-5 bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl shadow-sm shadow-black/[0.02] overflow-hidden px-4 sm:px-6 py-5" data-testid="episode-recap-body-card">
          {recapContent}
        </div>
      )}

      {!authUser && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-10"
        >
          <div className="bg-primary/[0.03] border border-primary/[0.08] rounded-2xl p-6 sm:p-8" data-testid="section-episode-cta">
            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-lg sm:text-xl font-display font-extrabold text-foreground leading-snug mb-2">
                  Get {episode.podcastName} recaps in your inbox
                </h2>
                <p className="text-[16px] text-muted-foreground">
                  We'll send a recap whenever a new episode drops.
                </p>
              </div>
              <form onSubmit={handleCtaSubmit} className="flex gap-2.5 w-full sm:w-auto" data-testid="form-signup-episode">
                <input
                  data-testid="input-email-episode"
                  type="email"
                  value={ctaEmail}
                  onChange={(e) => setCtaEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 sm:w-56 h-11 px-4 bg-white border border-black/[0.08] rounded-xl text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all font-medium placeholder:text-muted-foreground/40 shadow-sm shadow-black/[0.03]"
                />
                <button
                  data-testid="button-signup-episode"
                  type="submit"
                  className="h-11 px-5 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-base bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:brightness-105 disabled:opacity-40 transition-all active:scale-[0.98] whitespace-nowrap"
                >
                  Get Started
                </button>
              </form>
            </div>
          </div>
        </motion.div>
      )}

      {previousEpisodes.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-10"
          data-testid="section-more-episodes"
        >
          <div className="flex items-center gap-2.5 mb-4">
            <ListChecks className="w-4 h-4 text-primary" />
            <span className="text-base font-bold text-primary uppercase tracking-wider">More {episode.podcastName} Episode Recaps</span>
          </div>
          <div className="space-y-3">
            {authUser ? previousEpisodes.map((ep: any) => (
              <RecapCard
                key={ep.episodeSlug}
                id={`${podcastSlug}-${ep.episodeSlug}`}
                podcastSlug={podcastSlug}
                episodeSlug={ep.episodeSlug}
                podcastName={episode.podcastName}
                episodeTitle={ep.episodeTitle}
                publishDate={ep.publishDate}
                artworkUrl={episode.artworkUrl || podcastConfig?.artworkUrl || null}
                tldl={ep.tldl}
                duration={ep.duration}
                hosts={podcastConfig?.hosts}
                totalEpisodes={podcastConfig?.totalEpisodes}
                yearStarted={podcastConfig?.yearStarted}
                isFollowing={isFollowing}
                isBookmarked={(bookmarksData || []).some((b: any) => b.episodeSlug === ep.episodeSlug && b.podcastSlug === podcastSlug)}
                onFollowToggle={(slug, follow) => followMutation.mutate({ follow })}
                onBookmarkToggle={(epSlug, pSlug) => {
                  const bookmarked = (bookmarksData || []).some((b: any) => b.episodeSlug === epSlug && b.podcastSlug === pSlug);
                  if (bookmarked) {
                    genericRemoveBookmark.mutate({ episodeSlug: epSlug, podcastSlug: pSlug });
                  } else {
                    genericAddBookmark.mutate({ episodeSlug: epSlug, podcastSlug: pSlug });
                  }
                }}
                toast={toast}
                testIdPrefix="card-more-episode"
                className=""
              />
            )) : previousEpisodes.map((ep: any) => (
              <EpisodeCard
                key={ep.episodeSlug}
                episodeSlug={ep.episodeSlug}
                podcastSlug={podcastSlug}
                publishDate={ep.publishDate}
                episodeTitle={ep.episodeTitle}
                tldl={ep.tldl}
                duration={ep.duration}
                testIdPrefix="card-more-episode"
              />
            ))}
          </div>
          <div className="flex justify-center mt-6">
            <Link href={`/podcasts/${podcastSlug}`}>
              <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-display font-bold text-base bg-primary/[0.06] text-primary hover:bg-primary/[0.1] transition-colors" data-testid="link-all-episodes">
                View all {episode.podcastName} episodes
                <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          </div>
        </motion.section>
      )}
    </div>
  );

  if (!authUser) {
    return (
      <PodcastPageLayout config={podcastConfig}>
        <div className="mb-6">
          <div className="flex items-baseline justify-between gap-3 mb-[9px]">
            <span className="text-[12px] text-[#A1A1AA] overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0" style={{ fontFamily: "var(--font-mono)" }} data-testid="episode-card-title">
              {episode.episodeTitle}
            </span>
            <span className="text-[12px] text-[#A1A1AA] whitespace-nowrap flex-shrink-0" style={{ fontFamily: "var(--font-mono)" }}>
              {relativeTime(episode.publishDate)}
            </span>
          </div>
          {episode.tldl && (
            <h2 className="text-[26px] font-normal text-[#09090B] dark:text-white leading-[1.2] tracking-[-0.01em]" style={{ fontFamily: "var(--font-serif)" }} data-testid="episode-card-headline">
              {episode.tldl}
            </h2>
          )}
        </div>

        {recapContent}

        {previousEpisodes.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-10"
            data-testid="section-more-episodes"
          >
            <div className="flex items-center gap-2.5 mb-4">
              <ListChecks className="w-4 h-4 text-primary" />
              <span className="text-base font-bold text-primary uppercase tracking-wider">More {episode.podcastName} Episode Recaps</span>
            </div>
            <div className="space-y-3">
              {previousEpisodes.map((ep: any) => (
                <EpisodeCard
                  key={ep.episodeSlug}
                  episodeSlug={ep.episodeSlug}
                  podcastSlug={podcastSlug}
                  publishDate={ep.publishDate}
                  episodeTitle={ep.episodeTitle}
                  tldl={ep.tldl}
                  duration={ep.duration}
                  testIdPrefix="card-more-episode"
                />
              ))}
            </div>
            <div className="flex justify-center mt-6">
              <Link href={`/podcasts/${podcastSlug}`}>
                <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-display font-bold text-base bg-primary/[0.06] text-primary hover:bg-primary/[0.1] transition-colors" data-testid="link-all-episodes">
                  View all {episode.podcastName} episodes
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            </div>
          </motion.section>
        )}

        <EpisodeChatPanelWithRef
          ref={chatRef}
          podcastSlug={podcastSlug}
          episodeSlug={episodeSlug}
          episodeTitle={episode?.episodeTitle || ""}
          podcastName={episode?.podcastName || ""}
        />
      </PodcastPageLayout>
    );
  }

  return (
    <div className={`min-h-screen bg-[#F9F9FB] pb-[calc(60px+env(safe-area-inset-bottom,0px))] md:pb-0`}>
      {mainContent}

      <GetRecapsModal
        open={showUpdatesModal}
        onClose={() => setShowUpdatesModal(false)}
        podcastName={episode.podcastName}
        artworkUrl={episode.artworkUrl || podcastConfig?.artworkUrl}
        itunesId={podcastConfig?.itunesId || ""}
      />

      <EpisodeChatPanelWithRef
        ref={chatRef}
        podcastSlug={podcastSlug}
        episodeSlug={episodeSlug}
        episodeTitle={episode?.episodeTitle || ""}
        podcastName={episode?.podcastName || ""}
      />
    </div>
  );
}
