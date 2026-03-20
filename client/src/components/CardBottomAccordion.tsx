import { useState, useRef, useEffect } from "react";
import { ChevronDown, ExternalLink, Sparkles, ArrowUp, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
  id: number | string;
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

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

function InlineChatSection({ item }: { item: AccordionItemData }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const q = text || input.trim();
    if (!q || loading) return;
    setInput("");
    const userMsg: ChatMsg = { role: "user", content: q };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const resp = await fetch("/api/episode-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          podcastSlug: item.podcastSlug,
          episodeSlug: item.episodeSlug,
          question: q,
          conversationHistory: messages,
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

  return (
    <div className="px-4 md:px-5 py-4" data-testid={`inline-chat-${item.id}`}>
      <div className="max-h-[280px] overflow-y-auto space-y-2.5 mb-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[14px] leading-relaxed ${
              msg.role === "user"
                ? "bg-[#6366F1] text-white"
                : "bg-[#F4F4F5] text-[#3F3F46]"
            }`} data-testid={`inline-chat-msg-${item.id}-${i}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-3 py-2.5 bg-[#F4F4F5]">
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#A1A1AA] animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-[#A1A1AA] animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-[#A1A1AA] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex items-center gap-2 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] rounded-xl px-3 py-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
          placeholder="Ask about this episode..."
          className="flex-1 bg-transparent text-[14px] text-[#09090B] dark:text-white placeholder:text-[#52525B] dark:placeholder:text-[#A1A1AA] outline-none"
          data-testid={`inline-chat-input-${item.id}`}
        />
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${input.trim() && !loading ? "bg-[#6366F1] text-white hover:bg-[#4F46E5]" : "text-[#D4D4D8]"}`}
          data-testid={`inline-chat-send-${item.id}`}
        >
          <ArrowUp className="w-3.5 h-3.5" />
          <span>Ask AI</span>
        </button>
      </div>
    </div>
  );
}

export function CardBottomAccordion({ item, bottomBar, isLoggedIn }: {
  item: AccordionItemData;
  bottomBar: React.ReactNode;
  isLoggedIn?: boolean;
}) {
  const [openSection, setOpenSection] = useState<"recap" | "listen" | "chat" | null>(null);

  const whatHappenedParagraphs = item.whatHappened ? item.whatHappened.split(/\n\n+/).filter((p) => p.trim()) : [];
  const hasRecap = whatHappenedParagraphs.length > 0;

  const spotifyId = parseSpotifyEpisodeId(item.spotifyEpisodeUrl);
  const youtubeId = parseYouTubeVideoId(item.youtubeUrl);
  const hasListen = !!spotifyId || !!youtubeId || !!item.spotifyEpisodeUrl || !!item.spotifyUrl || (!!item.youtubeUrl && item.youtubeUrl !== '');

  const toggleSection = (section: "recap" | "listen" | "chat") => {
    setOpenSection(prev => prev === section ? null : section);
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

      {isLoggedIn && (
        <div className="border-t border-[#E4E4E7]" data-testid={`feed-chat-section-${item.id}`}>
          <div
            className={`flex items-center gap-3 px-4 md:px-5 py-[13px] cursor-pointer transition-colors ${openSection === "chat" ? "bg-[#F7F7FC]" : "hover:bg-[#FAFAFB]"}`}
            onClick={() => toggleSection("chat")}
            data-testid={`feed-chat-toggle-${item.id}`}
          >
            <div className="flex items-center flex-shrink-0">
              <Sparkles className="w-[22px] h-[22px] text-[#6366F1]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-[#09090B]">Chat about this episode</div>
            </div>
            <ChevronDown className={`w-4 h-4 text-[#A1A1AA] flex-shrink-0 transition-transform duration-200 ${openSection === "chat" ? "rotate-180 text-[#6366F1]" : ""}`} />
          </div>
          <AnimatePresence>
            {openSection === "chat" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden border-t border-[#F0F0F2]"
              >
                <InlineChatSection item={item} />
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
