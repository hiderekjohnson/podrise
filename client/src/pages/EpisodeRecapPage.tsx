import { useParams } from "wouter";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, Loader2, Sparkles, BookOpen, Globe, Users, Building2, ChevronRight, Megaphone, ExternalLink, Ticket, Copy, Check, Quote, X, ArrowUp, Clock, ShoppingBag, Bookmark, BookmarkCheck, Heart, ListChecks, ArrowRight, ArrowLeft, Lock, Mail } from "lucide-react";
import { BookCover as SharedBookCover } from "@/components/BookCover";
import { PodcastMicBadge } from "@/components/PodcastMicBadge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { SiX, SiLinkedin, SiInstagram } from "react-icons/si";
import { getPodcastBySlug, type PodcastLandingConfig } from "../data/podcastLandingData";
import { PEOPLE_DIRECTORY } from "../data/entityDirectoryData";
import { Link, useLocation } from "wouter";
import { GetRecapsModal } from "@/components/GetRecapsModal";
import { BlurredInsightGate } from "@/components/BlurredInsightGate";
import { SignUpCTAModal } from "@/components/SignUpCTAModal";
import { FeedStyleCard, FeedStyleCardHeader, FeedStyleCardSection } from "@/components/FeedStyleCard";
import { RecapCard } from "@/components/RecapCard";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { EpisodeCard } from "@/components/EpisodeCard";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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

function DeepDiveButton({ label, entityName, entityType, chatRef, podcastName, isLoggedIn, onAuthGate }: {
  label?: string;
  entityName: string;
  entityType: string;
  chatRef: React.RefObject<ChatContextRef | null>;
  podcastName?: string;
  isLoggedIn?: boolean;
  onAuthGate?: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isLoggedIn && onAuthGate) {
          onAuthGate();
          return;
        }
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

function AuthGatePanel({ onClose }: { onClose: () => void; onSuccess?: () => void }) {
  return (
    <div className="fixed bottom-[calc(50px+env(safe-area-inset-bottom,0px))] md:bottom-0 right-0 sm:bottom-6 sm:right-6 z-50 w-full sm:w-[380px] sm:max-w-[calc(100vw-2rem)] rounded-t-2xl sm:rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-background shadow-2xl shadow-black/[0.12] flex flex-col overflow-hidden" data-testid="auth-gate-panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08] bg-primary/[0.03]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <p className="text-[16px] font-semibold text-foreground">Ask AI</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0" data-testid="close-auth-gate">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
      <div className="px-5 py-6 space-y-4">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-[18px] font-bold text-foreground">Ask AI requires an account</h3>
          <p className="text-[14px] text-muted-foreground leading-relaxed">Create a free account to start chatting with AI about this episode.</p>
        </div>
        <a
          href="https://podrise.com/register"
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-[15px] font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
          data-testid="auth-gate-register"
        >
          <Sparkles className="w-4 h-4" />
          Get Started — It's Free
        </a>
      </div>
    </div>
  );
}

function EpisodeChatPanel({ podcastSlug, episodeSlug, episodeTitle, podcastName, isLoggedIn }: {
  podcastSlug: string;
  episodeSlug: string;
  episodeTitle: string;
  podcastName: string;
  isLoggedIn: boolean;
}, ref: React.Ref<ChatContextRef>) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
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
    if (!isLoggedIn) {
      setShowAuthGate(true);
      return;
    }
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
    if (showAuthGate) {
      return (
        <AuthGatePanel
          onClose={() => setShowAuthGate(false)}
          onSuccess={() => { setShowAuthGate(false); setIsOpen(true); }}
        />
      );
    }
    if (isLoggedIn) {
      return null;
    }
    return (
      <button
        onClick={() => {
          setShowAuthGate(true);
        }}
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

  const [showAllBooks, setShowAllBooks] = useState(false);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const chatRef = useRef<ChatContextRef | null>(null);
  const { toast } = useToast();
  const { data: authUser } = useAuth();
  const isLoggedIn = !!authUser;
  const [showAuthGatePanel, setShowAuthGatePanel] = useState(false);
  const [showUpdatesModal, setShowUpdatesModal] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [showSignUpCTA, setShowSignUpCTA] = useState(false);
  const [stickyDismissed, setStickyDismissed] = useState(false);
  const ctaSectionRef = useRef<HTMLDivElement>(null);

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

  const { data: podcastHosts } = useQuery<any[]>({
    queryKey: ["/api/podcasts", podcastSlug, "hosts"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/hosts`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!podcastSlug,
  });


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
      const offset = (authUser ? 0 : 68) + 52 + 40;
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

  useEffect(() => {
    if (isLoggedIn || stickyDismissed) return;
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const threshold = 600;
      const ctaEl = ctaSectionRef.current;
      const ctaInView = ctaEl
        ? ctaEl.getBoundingClientRect().top < window.innerHeight - 60 && ctaEl.getBoundingClientRect().bottom > 60
        : false;
      setShowStickyBar(scrollY > threshold && !ctaInView);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isLoggedIn, stickyDismissed]);


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
    const headerHeight = authUser ? 0 : 68;
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
        {authUser && (
          <button
            onClick={() => window.history.back()}
            className="text-[#71717A] hover:text-[#09090B] dark:hover:text-white transition-colors"
            data-testid="back-button"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}


        {!authUser && episode.keyInsights?.length > 0 && (
          <section id="section-key-insights" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-key-insights">
            <div className="px-5 sm:px-6 py-4 border-b border-[#F0F0F2] dark:border-white/[0.06]">
              <span className="text-[11px] font-medium tracking-[0.15em] uppercase text-[#A1A1AA]" style={{ fontFamily: "var(--font-mono)" }}>
                KEY TAKEAWAYS
              </span>
            </div>
            <div className="px-5 sm:px-6 py-[22px] space-y-4">
              {episode.keyInsights.map((insight: string, i: number) => {
                const insightContent = (
                  <div
                    key={i}
                    className="flex gap-3 items-start"
                    data-testid={`insight-${i}`}
                  >
                    <span className="w-[8px] h-[8px] rounded-full bg-[#6366F1] shrink-0 mt-[9px]" />
                    <p className="text-[15px] leading-[1.75] text-[#52525B] dark:text-[#A1A1AA] flex-1">{insight.replace(/\[([^\]]+)\]/g, '$1')}</p>
                  </div>
                );

                if (i === 3 && episode.keyInsights.length >= 4) {
                  return (
                    <BlurredInsightGate key={i} onRevealClick={() => setShowSignUpCTA(true)}>
                      {insightContent}
                    </BlurredInsightGate>
                  );
                }

                return insightContent;
              })}
            </div>
          </section>
        )}

        <section id="section-what-happened" className="bg-white dark:bg-white/[0.03] border border-[#E4E4E7] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)]" data-testid="section-what-happened">
          <div className="px-5 sm:px-6 pt-5 pb-[18px] border-b border-[#F0F0F2] dark:border-white/[0.06]">
            <div className="flex items-center gap-2.5 mb-[9px]">
              <BookOpen className="w-4 h-4 text-primary shrink-0" />
              <span className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#A1A1AA]" style={{ fontFamily: "var(--font-mono)" }}>Episode Recap</span>
            </div>
            <h3 className="text-[26px] font-normal text-[#09090B] dark:text-white leading-[1.2] tracking-[-0.01em]" style={{ fontFamily: "var(--font-serif)" }}>
              {episode.episodeTitle || seoSubject}
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
                      return (
                      <div key={i} className="flex items-start gap-4" data-testid={`host-card-${i}`}>
                        <div className="flex-shrink-0">
                          <GuestPhoto name={host.name} photoUrl={host.photoUrl} testId={`host-photo-${i}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[17px] font-bold text-foreground" data-testid={`host-name-${i}`}>
                            {host.name}
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
                      return (
                      <div key={i} className="flex items-start gap-4" data-testid={`guest-card-${i}`}>
                        <div className="flex-shrink-0">
                          <GuestPhoto name={guest.name} photoUrl={guest.photoUrl} testId={`guest-photo-${i}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[17px] font-bold text-foreground" data-testid={`guest-name-${i}`}>
                            {guest.name}
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




        {(hasBooks || hasShopProducts) && (
          <section id="section-shop" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-shop">
            <div className="px-4 sm:px-6 py-4 bg-[#6366F1]/[0.04] border-b border-[#6366F1]/[0.08]">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-4 h-4 text-[#6366F1] shrink-0" />
                <h2 className="text-base font-bold text-[#6366F1] dark:text-[#A5B4FC] uppercase tracking-wider m-0">Pod Shop</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#6366F1]/10 text-[#6366F1] border border-[#6366F1]/20">Beta</span>
              </div>
            </div>
            <div className="px-4 sm:px-6 py-5">
              {hasBooks && !isLoggedIn && (
              <>
              <div className="flex items-center gap-2.5 mb-5">
                <BookOpen className="w-4 h-4 text-primary shrink-0" />
                <h3 className="text-base font-bold text-primary uppercase tracking-wider m-0">Books Mentioned</h3>
              </div>
              <div className="relative overflow-hidden rounded-xl" data-testid="episode-books-signup-teaser">
                <div className="flex flex-col gap-5 pointer-events-none select-none">
                  {books.slice(0, 2).map((book, i) => {
                    const bookKey = book.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
                    const enrichment = bookSlugMap[bookKey];
                    const displayAuthor = enrichment?.author || book.author;
                    return (
                      <div key={i} className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-5" data-testid={`book-teaser-${i}`}>
                        <div className="flex gap-4">
                          <BookCover title={book.name} asin={enrichment?.asin || extractAsin(book.url || "")} slug={enrichment?.slug} googleBooksId={enrichment?.googleBooksId} isbn={enrichment?.isbn} hasCover={enrichment?.hasCover} testId={`book-teaser-cover-${i}`} />
                          <div className="flex-1 min-w-0">
                            <h3 className="text-[16px] font-bold text-foreground leading-snug">{book.name}</h3>
                            {displayAuthor && displayAuthor !== "null" && (
                              <p className="text-[16px] text-muted-foreground mt-0.5">by {displayAuthor}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="absolute inset-0 backdrop-blur-[4px] bg-white/60 dark:bg-zinc-950/60 flex items-center justify-center">
                  <div className="text-center px-4 py-6 max-w-md">
                    <p className="text-[15px] text-muted-foreground mb-4" data-testid="text-books-teaser-headline">
                      Access the complete list of {books.length} book{books.length !== 1 ? "s" : ""} mentioned in this episode, with cross-podcast recommendations and deep dives.
                    </p>
                    <Link
                      href="/register"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-primary text-primary hover:bg-primary/5 font-semibold text-[14px] transition-colors"
                      data-testid="button-signup-episode-books"
                    >
                      <Lock className="w-4 h-4" />
                      Register For Free
                    </Link>
                  </div>
                </div>
              </div>
            </>
            )}
            {hasBooks && isLoggedIn && (
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
                        <DeepDiveButton entityName={book.name} entityType="book" chatRef={chatRef} isLoggedIn={isLoggedIn} onAuthGate={() => setShowAuthGatePanel(true)} />
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
            {hasShopProducts && !isLoggedIn && (
              <div className="mt-8 pt-6 border-t border-black/[0.06] dark:border-white/[0.08]">
                <div className="flex items-center gap-2.5 mb-5">
                  <ShoppingBag className="w-4 h-4 text-emerald-600 shrink-0" />
                  <h3 className="text-base font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider m-0">Products & Tools Mentioned</h3>
                </div>
                <div className="relative" data-testid="episode-products-signup-teaser">
                  <div className="flex flex-col gap-5 pointer-events-none select-none">
                    {shopProducts.slice(0, 2).map((product: any, i: number) => (
                      <div key={i} className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-5" data-testid={`product-teaser-${i}`}>
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-emerald-500/[0.08] flex items-center justify-center shrink-0">
                            <ShoppingBag className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-[16px] font-bold text-foreground leading-snug">{product.name}</h3>
                            {product.company && product.company !== product.name && (
                              <p className="text-[14px] text-muted-foreground mt-0.5">by {product.company}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/70 to-white dark:via-zinc-950/70 dark:to-zinc-950 flex items-end justify-center pb-2">
                    <div className="text-center px-4 py-6 max-w-md">
                      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/10 mb-3">
                        <Lock className="w-5 h-5 text-emerald-600" />
                      </div>
                      <p className="text-[15px] font-bold text-foreground mb-1.5" data-testid="text-products-teaser-headline">
                        Sign up free to see all {shopProducts.length} product{shopProducts.length !== 1 ? "s" : ""} from this episode
                      </p>
                      <p className="text-[13px] text-muted-foreground mb-4">
                        Get the full list of tools and products mentioned.
                      </p>
                      <Link
                        href="/register"
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-[14px] transition-colors shadow-sm"
                        data-testid="button-signup-episode-products"
                      >
                        Sign Up Free
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {hasShopProducts && isLoggedIn && (
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
    <div className="px-4 md:px-6 py-6 pb-24 md:pb-8">
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
          isLoggedIn={isLoggedIn}
        />
      ) : null}

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
                tabloidSubHeadline={ep.tabloidSubHeadline}
                keyInsights={ep.keyInsights}
                quote={ep.quote}
                quoteAttribution={ep.quoteAttribution}
                whatHappened={ep.whatHappened}
                spotifyEpisodeUrl={ep.spotifyEpisodeUrl}
                spotifyUrl={ep.spotifyUrl}
                youtubeUrl={ep.youtubeUrl}
                mentions={ep.mentions}
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
                isLoggedIn={isLoggedIn}
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

  const episodeDate = (() => {
    const d = new Date(episode.publishDate + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  })();

  const hostLine = (() => {
    const hostStr = podcastConfig?.hosts || "";
    const guestStr = guests.length > 0 ? guests.map(g => g.name).join(", ") : "";
    if (hostStr && guestStr) return `${hostStr} with ${guestStr}`;
    return hostStr || guestStr || "";
  })();

  const sidebarBooksForEpisode = books.slice(0, 2);

  if (!authUser) {
    return (
      <div className="min-h-screen flex flex-col overflow-x-clip">
        <SiteHeader />

        <div className="bg-white dark:bg-zinc-950 border-b border-[#E4E4E7] dark:border-white/[0.06]" data-testid="episode-hero">
          <div className="max-w-7xl mx-auto px-4 sm:px-7 pt-8 pb-0">
            <div className="flex gap-6 items-start mb-6">
              <Link href={`/podcasts/${podcastSlug}`}>
                <img
                  src={episode.artworkUrl || podcastConfig?.artworkUrl || ""}
                  alt={episode.podcastName}
                  className="w-[80px] h-[80px] rounded-[14px] object-cover shrink-0"
                  data-testid="img-episode-artwork"
                />
              </Link>
              <h1
                className="text-[28px] sm:text-[28px] font-normal leading-[1.25] tracking-[-0.02em] text-[#09090B] dark:text-white"
                style={{ fontFamily: "var(--font-serif)" }}
                data-testid="text-episode-title"
              >
                {episode.episodeTitle}
              </h1>
            </div>

            <p className="text-[12px] text-[#A1A1AA] mb-4" data-testid="breadcrumb-nav">
              <Link href="/" className="text-[#6366F1] hover:underline">Home</Link>
              {" › "}
              <Link href="/podcasts" className="text-[#6366F1] hover:underline">Podcasts</Link>
              {" › "}
              <Link href={`/podcasts/${podcastSlug}`} className="text-[#6366F1] hover:underline">{episode.podcastName}</Link>
            </p>

            <div className="flex items-center gap-2 text-[12px] text-[#A1A1AA] mb-5" data-testid="episode-meta-line">
              <span>{episodeDate}</span>
              {episode.duration && (
                <>
                  <span className="w-[3px] h-[3px] rounded-full bg-[#D4D4D8] inline-block" />
                  <span>{episode.duration}</span>
                </>
              )}
              {hostLine && (
                <>
                  <span className="w-[3px] h-[3px] rounded-full bg-[#D4D4D8] inline-block" />
                  <span>{hostLine}</span>
                </>
              )}
            </div>

          </div>
        </div>

        <main className="flex-1">
          <div className="max-w-7xl mx-auto px-4 sm:px-7 py-8 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px] gap-8 items-start">
            <div>
              {episode.keyInsights?.length > 0 && (
                <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-white/[0.1] rounded-xl p-6 mb-5" data-testid="section-key-insights">
                  <p className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#6366F1] mb-4 flex items-center gap-1.5">
                    <Lightbulb className="w-[14px] h-[14px]" />
                    Key takeaways
                  </p>
                  <ul className="list-none p-0 m-0">
                    {episode.keyInsights.map((insight: string, i: number) => {
                      const content = (
                        <li
                          key={i}
                          className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.7] py-[10px] border-b border-[#F0F0F2] dark:border-white/[0.06] last:border-b-0 last:pb-0 pl-5 relative"
                          data-testid={`insight-${i}`}
                        >
                          <span className="absolute left-0 top-[18px] w-[6px] h-[6px] rounded-full bg-[#6366F1]" />
                          {insight.replace(/\[([^\]]+)\]/g, '$1')}
                        </li>
                      );

                      if (i === 3 && episode.keyInsights.length >= 4) {
                        return (
                          <BlurredInsightGate key={i} onRevealClick={() => setShowSignUpCTA(true)} as="li">
                            <div className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.7] py-[10px] pl-5 relative">
                              <span className="absolute left-0 top-[18px] w-[6px] h-[6px] rounded-full bg-[#6366F1]" />
                              {insight.replace(/\[([^\]]+)\]/g, '$1')}
                            </div>
                          </BlurredInsightGate>
                        );
                      }

                      return content;
                    })}
                  </ul>
                </div>
              )}

              <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-white/[0.1] rounded-xl p-6 mb-5" data-testid="section-what-happened">
                <p className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#6366F1] mb-4 flex items-center gap-1.5">
                  <BookOpen className="w-[14px] h-[14px]" />
                  Episode recap
                </p>
                {whatHappenedParagraphs.map((paragraph: string, i: number) => (
                  <p key={i} className="text-[15px] leading-[1.8] text-[#52525B] dark:text-[#A1A1AA] mb-4 last:mb-0">
                    {paragraph}
                  </p>
                ))}
              </div>

              {previousEpisodes.length > 0 && (
                <div className="mt-5" data-testid="section-more-episodes">
                  <p className="text-[11px] font-medium tracking-[0.1em] uppercase text-[#6366F1] mb-[14px] flex items-center gap-1.5">
                    <ListChecks className="w-[13px] h-[13px]" />
                    More {episode.podcastName} episodes
                  </p>
                  <div className="flex flex-col gap-[10px]">
                    {previousEpisodes.slice(0, 3).map((ep: any) => (
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
                </div>
              )}
            </div>

            <aside className="flex flex-col gap-4" data-testid="episode-sidebar">
              {guests.length > 0 && (
                <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-white/[0.1] rounded-xl overflow-hidden" data-testid="sidebar-guests">
                  <div className="px-4 py-[14px] border-b border-[#F0F0F2] dark:border-white/[0.06]">
                    <p className="text-[13px] font-medium text-[#09090B] dark:text-white flex items-center gap-1.5 mb-[2px]">
                      <Users className="w-[14px] h-[14px] text-[#6366F1]" />
                      {guests.length === 1 ? "Guest" : "Guests"}
                    </p>
                    <p className="text-[12px] text-[#A1A1AA]">In this episode</p>
                  </div>
                  {guests.map((guest, i) => (
                    <div key={i} className="px-4 py-[10px] border-b border-[#F0F0F2] dark:border-white/[0.06] last:border-b-0" data-testid={`sidebar-guest-${i}`}>
                      <div className="flex items-center gap-[10px] mb-1">
                        <div className="w-8 h-8 rounded-full bg-[#EEF2FF] flex items-center justify-center text-[13px] font-medium text-[#6366F1] shrink-0">
                          {guest.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-[#09090B] dark:text-white truncate" data-testid={`sidebar-guest-name-${i}`}>{guest.name}</p>
                          {guest.title && <p className="text-[12px] text-[#A1A1AA] truncate">{guest.title}</p>}
                        </div>
                      </div>
                      {guest.bio && (
                        <p className="text-[12px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.55] mt-1 line-clamp-2">{guest.bio}</p>
                      )}
                      {(guest.twitter || guest.linkedin || guest.website) && (
                        <div className="flex gap-2 mt-[6px]">
                          {guest.website && (
                            <a href={guest.website.startsWith("http") ? guest.website : `https://${guest.website}`} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[#6366F1] hover:underline flex items-center gap-1" data-testid={`sidebar-guest-website-${i}`}>
                              <Globe className="w-3 h-3" />
                            </a>
                          )}
                          {guest.twitter && (
                            <a href={guest.twitter.startsWith("http") ? guest.twitter : `https://x.com/${guest.twitter.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[#6366F1] hover:underline flex items-center gap-1" data-testid={`sidebar-guest-twitter-${i}`}>
                              <SiX className="w-3 h-3" />
                            </a>
                          )}
                          {guest.linkedin && (
                            <a href={guest.linkedin.startsWith("http") ? guest.linkedin : `https://linkedin.com/in/${guest.linkedin}`} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[#6366F1] hover:underline flex items-center gap-1" data-testid={`sidebar-guest-linkedin-${i}`}>
                              <SiLinkedin className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {sidebarBooksForEpisode.length > 0 && (
                <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-white/[0.1] rounded-xl overflow-hidden" data-testid="sidebar-books-mentioned">
                  <div className="px-4 py-[14px] border-b border-[#F0F0F2] dark:border-white/[0.06]">
                    <p className="text-[13px] font-medium text-[#09090B] dark:text-white flex items-center gap-1.5 mb-[2px]">
                      <BookOpen className="w-[14px] h-[14px] text-[#6366F1]" />
                      Books mentioned
                    </p>
                    <p className="text-[12px] text-[#A1A1AA]">In this episode</p>
                  </div>
                  {sidebarBooksForEpisode.map((book, i) => {
                    const bookKey = book.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
                    const enrichment = bookSlugMap[bookKey];
                    const displayAuthor = enrichment?.author || book.author;
                    const isLocked = i >= 1 && books.length > 2;
                    return (
                      <div key={i} className={`flex items-center gap-[10px] px-4 py-[10px] border-b border-[#F0F0F2] dark:border-white/[0.06] last:border-b-0 ${isLocked ? "opacity-[0.35]" : ""}`} data-testid={`sidebar-book-${i}`}>
                        <div className="w-8 h-11 rounded-[3px] overflow-hidden shrink-0 bg-[#EEF2FF]">
                          <SharedBookCover title={book.name} slug={enrichment?.slug} googleBooksId={enrichment?.googleBooksId} isbn={enrichment?.isbn} hasCover={enrichment?.hasCover} size="sm" className="w-8 h-11 rounded-[3px] object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-[#09090B] dark:text-white truncate">{book.name}</p>
                          {displayAuthor && displayAuthor !== "null" && (
                            <p className="text-[12px] text-[#A1A1AA]">{displayAuthor}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {books.length > 2 && (
                    <div className="px-4 py-[14px] border-t border-[#F0F0F2] dark:border-white/[0.06] bg-[#FAFAFA] dark:bg-zinc-800/50 text-center">
                      <p className="text-[12px] text-[#71717A] mb-[10px] leading-[1.5]">Sign up free to see all books from this episode</p>
                      <Link
                        href="/register"
                        className="block w-full bg-[#6366F1] text-white text-[13px] font-medium py-[9px] rounded-lg text-center hover:bg-[#4F46E5] transition-colors"
                        data-testid="sidebar-books-signup"
                      >
                        See all books →
                      </Link>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-white dark:bg-zinc-900 border border-[#E4E4E7] dark:border-white/[0.1] rounded-xl p-[18px]" data-testid="sidebar-follow-cta">
                <p className="text-[13px] font-medium text-[#09090B] dark:text-white mb-1">Get {episode.podcastName} in your daily briefing</p>
                <p className="text-[12px] text-[#71717A] mb-[14px] leading-[1.5]">New episodes land in your inbox the morning after they drop.</p>
                <Link
                  href="/register"
                  className="block w-full bg-[#6366F1] text-white text-[13px] font-medium py-[9px] rounded-lg text-center hover:bg-[#4F46E5] transition-colors"
                  data-testid="sidebar-follow-signup"
                >
                  Follow this show →
                </Link>
              </div>
            </aside>
          </div>
        </main>

        <Footer />

        <EpisodeChatPanelWithRef
          ref={chatRef}
          podcastSlug={podcastSlug}
          episodeSlug={episodeSlug}
          episodeTitle={episode?.episodeTitle || ""}
          podcastName={episode?.podcastName || ""}
          isLoggedIn={isLoggedIn}
        />
        {showAuthGatePanel && (
          <AuthGatePanel
            onClose={() => setShowAuthGatePanel(false)}
            onSuccess={() => { setShowAuthGatePanel(false); }}
          />
        )}

        <GetRecapsModal
          open={showUpdatesModal}
          onClose={() => setShowUpdatesModal(false)}
          podcastName={episode.podcastName}
          artworkUrl={episode.artworkUrl || podcastConfig?.artworkUrl}
          itunesId={podcastConfig?.itunesId || ""}
        />

        <SignUpCTAModal
          open={showSignUpCTA}
          onClose={() => setShowSignUpCTA(false)}
        />
      </div>
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

      <SignUpCTAModal
        open={showSignUpCTA}
        onClose={() => setShowSignUpCTA(false)}
      />

      <EpisodeChatPanelWithRef
        ref={chatRef}
        podcastSlug={podcastSlug}
        episodeSlug={episodeSlug}
        episodeTitle={episode?.episodeTitle || ""}
        podcastName={episode?.podcastName || ""}
        isLoggedIn={isLoggedIn}
      />
      {showAuthGatePanel && (
        <AuthGatePanel
          onClose={() => setShowAuthGatePanel(false)}
          onSuccess={() => { setShowAuthGatePanel(false); }}
        />
      )}
    </div>
  );
}
