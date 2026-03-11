import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams, Link } from "wouter";
import { Loader2, ArrowRight, Clock, Calendar, Mic, Users, Star, Search, X, Compass, Headphones, Sparkles, Send, MessageSquare, ShoppingBag } from "lucide-react";
import { SiX, SiApplepodcasts, SiSpotify, SiYoutube, SiLinkedin, SiInstagram, SiTiktok, SiFacebook, SiDiscord } from "react-icons/si";
import { ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import { PodCapHeader } from "@/components/PodCapHeader";
import { PodcastPageLayout, type PodcastTab } from "@/components/PodcastPageLayout";

import { getPodcastBySlug, PODCAST_LANDINGS } from "@/data/podcastLandingData";
import type { PodcastLandingConfig } from "@/data/podcastLandingData";
import { EpisodeCard } from "@/components/EpisodeCard";
import { PodCapWordmark } from "@/components/PodCapHeader";

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} className="bg-primary/20 text-foreground rounded px-0.5">{part}</mark> : part
  );
}

function TranscriptSearch({ slug, podcastName }: { slug: string; podcastName: string }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const handleChange = useCallback((val: string) => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 400);
  }, []);

  type SearchHit = { text: string; anchorId: string; timestampLabel: string | null; speakerName: string | null };
  type SearchResult = { episodeTitle: string; episodeSlug: string; publishDate: string; mentions: number; hits: SearchHit[] };
  type SearchResponse = { results: SearchResult[]; query: string; total: number };

  const { data, isLoading, isError } = useQuery<SearchResponse>({
    queryKey: ["/api/podcasts", slug, "search", debouncedQuery],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${slug}/search?q=${encodeURIComponent(debouncedQuery)}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: debouncedQuery.length >= 2,
    retry: 1,
  });

  return (
    <div data-testid="section-transcript-search">
      <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mb-4">
        Search across every episode transcript to find exactly where a topic was discussed.
      </p>
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground/40" />
        <input
          ref={inputRef}
          data-testid="input-transcript-search"
          type="text"
          value={query}
          onChange={(e) => { handleChange(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          placeholder={`Search "${podcastName}" transcripts...`}
          className="w-full h-12 pl-12 pr-10 bg-white border border-black/[0.06] rounded-xl text-foreground text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium placeholder:text-muted-foreground/40 shadow-sm shadow-black/[0.02]"
        />
        {query && (
          <button
            data-testid="button-clear-search"
            onClick={() => { setQuery(""); setDebouncedQuery(""); setIsOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground/40 hover:text-muted-foreground hover:bg-black/[0.04] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && debouncedQuery.length >= 2 && (
        <div>
          {isLoading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2.5" data-testid="search-loading">
              <Loader2 className="w-5 h-5 animate-spin text-primary/50" />
              <span className="text-base font-medium">Searching transcripts...</span>
            </div>
          )}

          {!isLoading && isError && (
            <div className="text-center py-10 bg-red-50/50 rounded-xl border border-red-100" data-testid="search-error">
              <p className="text-muted-foreground text-sm">Search is temporarily unavailable. Please try again.</p>
            </div>
          )}

          {!isLoading && !isError && data && data.results.length === 0 && (
            <div className="text-center py-10" data-testid="search-no-results">
              <Search className="w-8 h-8 text-muted-foreground/15 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">No mentions of "<span className="font-semibold text-foreground/70">{debouncedQuery}</span>" found in transcripts.</p>
            </div>
          )}

          {!isLoading && data && data.results.length > 0 && (
            <div data-testid="search-results">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[15px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Found in {data.total} episode{data.total !== 1 ? "s" : ""}
                </p>
                <span className="text-[15px] text-muted-foreground/50">
                  "{data.query}"
                </span>
              </div>
              <div className="space-y-4">
                {data.results.map((result, idx) => {
                  const dateStr = result.publishDate
                    ? new Date(result.publishDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : null;
                  return (
                    <div
                      key={idx}
                      className="bg-white border border-black/[0.06] rounded-xl overflow-hidden"
                      data-testid={`search-result-${idx}`}
                    >
                      <div className="px-5 py-3.5 border-b border-black/[0.04] bg-black/[0.01]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link href={`/podcasts/${slug}/${result.episodeSlug}`}>
                              <span className="text-[15px] font-bold text-foreground hover:text-primary transition-colors cursor-pointer leading-snug" data-testid={`search-result-title-${idx}`}>
                                {result.episodeTitle}
                              </span>
                            </Link>
                            {dateStr && (
                              <p className="text-[15px] text-muted-foreground/50 mt-0.5 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {dateStr}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-lg text-[15px] font-bold bg-primary/[0.08] text-primary">
                            {result.mentions} mention{result.mentions !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <div className="divide-y divide-black/[0.03]">
                        {result.hits.map((hit, sIdx) => (
                          <a
                            key={sIdx}
                            href={`/podcasts/${slug}/${result.episodeSlug}/transcript#${hit.anchorId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-2.5 px-5 py-3 hover:bg-primary/[0.03] transition-colors group"
                            data-testid={`search-hit-${idx}-${sIdx}`}
                          >
                            {hit.timestampLabel && (
                              <span className="shrink-0 text-[15px] font-bold text-primary/70 bg-primary/[0.06] rounded px-1.5 py-0.5 mt-0.5 font-mono">
                                {hit.timestampLabel}
                              </span>
                            )}
                            <span className="flex-1 text-base text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed line-clamp-2">{highlightMatch(hit.text, data.query)}</span>
                            <span className="shrink-0 flex items-center gap-1 text-[15px] font-semibold text-primary/50 group-hover:text-primary mt-0.5 transition-colors whitespace-nowrap">
                              View in transcript
                              <ArrowRight className="w-3 h-3" />
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function AskPodcast({ slug, podcastName }: { slug: string; podcastName: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ answer: string; episodesCited: string[] } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  type TopQ = { question: string; answer: string };
  const { data: topQData, isLoading: topQLoading } = useQuery<{ questions: TopQ[] }>({
    queryKey: ["/api/podcasts", slug, "top-questions"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${slug}/top-questions`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const topQuestions = topQData?.questions || [];

  const handleSubmit = async (q?: string) => {
    const finalQ = (q || question).trim();
    if (!finalQ || finalQ.length < 3) return;
    setIsLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch(`/api/podcasts/${slug}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: finalQ }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to get answer");
      }
      const data = await res.json();
      setAnswer(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const exampleQuestions = [
    `What did they say about SaaS businesses?`,
    `What startup ideas have they discussed recently?`,
    `What advice do they give for building an audience?`,
  ];

  return (
    <div data-testid="section-ask-podcast">
      <div className="mb-8">
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Ask anything about {podcastName} — its themes, topics, hosts, and past episodes. Explore common questions below or ask your own.
        </p>
      </div>

      {topQLoading && (
        <div className="flex items-center justify-center py-10 text-muted-foreground gap-2.5 mb-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary/50" />
          <span className="text-base font-medium">Loading top questions...</span>
        </div>
      )}

      {topQuestions.length > 0 && (
        <div className="mb-10" data-testid="section-top-questions-podcast">
          <h2 className="text-xl sm:text-[22px] font-display font-bold text-foreground mb-5 flex items-center gap-2.5">
            <span className="w-1 h-6 rounded-full bg-violet-400" />
            Top Questions About {podcastName}
          </h2>
          <div className="space-y-3">
            {topQuestions.map((item, i) => (
              <div
                key={i}
                className="bg-white dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.08] rounded-xl overflow-hidden shadow-sm shadow-black/[0.02]"
                data-testid={`top-q-item-${i}`}
              >
                <button
                  onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                  data-testid={`top-q-toggle-${i}`}
                >
                  <span className="text-[15px] font-semibold text-foreground leading-snug">{item.question}</span>
                  <svg
                    className={`w-4 h-4 text-muted-foreground/40 shrink-0 transition-transform duration-200 ${expandedFaq === i ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedFaq === i && (
                  <div className="px-5 pb-5 pt-1 border-t border-black/[0.04] dark:border-white/[0.06]">
                    {item.answer.split("\n\n").filter(Boolean).map((p, pi) => (
                      <p key={pi} className="text-[15px] leading-[1.8] text-muted-foreground mb-3 last:mb-0">{p}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="relative bg-gradient-to-br from-violet-500/[0.04] to-primary/[0.03] border border-violet-500/[0.1] rounded-2xl px-6 py-6 sm:px-7 sm:py-7">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-500/[0.1]">
            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
          </span>
          <span className="text-base font-bold text-foreground">Ask your own question about this podcast</span>
          <span className="ml-1 px-1.5 py-0.5 text-[15px] font-bold uppercase tracking-wider rounded bg-violet-500/10 text-violet-500 leading-none">Powered by AI</span>
        </div>
        <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mb-5">
          Ask any question and get an answer drawn from across all episodes of {podcastName}.
        </p>

        <form
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          className="flex gap-2"
          data-testid="form-ask-podcast"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={`Ask anything about ${podcastName}...`}
            className="flex-1 h-11 px-4 bg-white dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] rounded-xl text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/30 transition-all placeholder:text-muted-foreground/40"
            data-testid="input-ask-podcast"
          />
          <button
            type="submit"
            disabled={!question.trim() || isLoading}
            className="h-11 px-5 flex items-center gap-2 rounded-xl font-bold text-base bg-violet-500 text-white shadow-sm hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
            data-testid="button-ask-podcast-submit"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Ask
          </button>
        </form>

        {!answer && !isLoading && !error && (
          <div className="mt-4" data-testid="ask-podcast-examples">
            <p className="text-[15px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2.5">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {exampleQuestions.map((eq, i) => (
                <button
                  key={i}
                  onClick={() => { setQuestion(eq); handleSubmit(eq); }}
                  className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 hover:bg-violet-500/[0.06] px-2.5 py-1 rounded-lg transition-colors text-left"
                  data-testid={`ask-podcast-example-${i}`}
                >
                  {eq}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="mt-5 bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-xl px-5 py-4">
            <div className="flex items-center gap-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
              <span className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">Searching across all episodes...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-5 bg-red-50/50 dark:bg-red-900/10 border border-red-200/50 dark:border-red-800/30 rounded-xl px-5 py-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {answer && (
          <div className="mt-5 bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-xl px-5 py-4" data-testid="ask-podcast-answer">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-3.5 h-3.5 text-violet-500" />
              <span className="text-[15px] font-bold text-violet-500 uppercase tracking-wider">Answer</span>
            </div>
            <div className="space-y-3">
              {answer.answer.split("\n\n").filter(Boolean).map((p, i) => (
                <p key={i} className="text-[15px] leading-[1.8] text-muted-foreground">{p}</p>
              ))}
            </div>
            {answer.episodesCited && answer.episodesCited.length > 0 && (
              <div className="mt-4 pt-3 border-t border-black/[0.04] dark:border-white/[0.06]">
                <p className="text-[15px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Sources</p>
                <div className="flex flex-wrap gap-1.5">
                  {answer.episodesCited.map((ep, i) => (
                    <span key={i} className="text-base text-[#3F3F46] dark:text-[#A1A1AA] bg-black/[0.03] dark:bg-white/[0.06] px-2 py-1 rounded-md">{ep}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PodcastLandingGeneric() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const staticConfig = getPodcastBySlug(slug || "");
  const [, navigate] = useLocation();
  const { data: user } = useAuth();

  const getTabFromUrl = () => {
    const urlTab = new URLSearchParams(window.location.search).get("tab");
    if (urlTab === "search" || urlTab === "ask" || urlTab === "about" || urlTab === "discover" || urlTab === "episodes") return urlTab;
    return "episodes" as PodcastTab;
  };
  const [activeTab, setActiveTab] = useState<PodcastTab>(getTabFromUrl);

  useEffect(() => {
    setActiveTab(getTabFromUrl());
  }, [slug]);

  const { data: dbEntry } = useQuery<any>({
    queryKey: ["/api/podcasts/by-slug", slug],
    enabled: !!slug,
  });

  const { data: podcastHosts } = useQuery<any[]>({
    queryKey: ["/api/podcasts", slug, "hosts"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${slug}/hosts`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!slug,
  });

  const config = dbEntry ? {
    slug: dbEntry.slug,
    name: dbEntry.name,
    itunesId: dbEntry.itunesId,
    category: dbEntry.category || "",
    hosts: dbEntry.hosts || "",
    description: dbEntry.description || "",
    keywords: dbEntry.keywords || "",
    faqTopics: dbEntry.faqTopics || "",
    artworkUrl: dbEntry.artworkUrl || "",
    appleUrl: dbEntry.appleUrl,
    spotifyUrl: dbEntry.spotifyUrl,
    youtubeUrl: dbEntry.youtubeUrl,
    avgEpisodeLength: dbEntry.avgEpisodeLength,
    frequency: dbEntry.frequency,
    totalEpisodes: dbEntry.totalEpisodes,
    yearStarted: dbEntry.yearStarted,
    knownFor: dbEntry.knownFor,
    hostBios: (() => { try { return typeof dbEntry.hostBios === "string" ? JSON.parse(dbEntry.hostBios) : Array.isArray(dbEntry.hostBios) ? dbEntry.hostBios : undefined; } catch { return undefined; } })(),
    relatedSlugs: dbEntry.relatedSlugs,
    aboutPodcast: dbEntry.aboutPodcast,
    twitterHandle: dbEntry.twitterHandle,
    instagramUrl: (dbEntry as any).instagramUrl,
    tiktokUrl: (dbEntry as any).tiktokUrl,
    facebookUrl: (dbEntry as any).facebookUrl,
    discordUrl: (dbEntry as any).discordUrl,
    websiteUrl: (dbEntry as any).websiteUrl,
    storeUrl: (dbEntry as any).storeUrl,
  } as PodcastLandingConfig & { twitterHandle?: string | null; instagramUrl?: string | null; tiktokUrl?: string | null; facebookUrl?: string | null; discordUrl?: string | null; websiteUrl?: string | null; storeUrl?: string | null } : staticConfig ? { ...staticConfig, twitterHandle: null as string | null, instagramUrl: null as string | null, tiktokUrl: null as string | null, facebookUrl: null as string | null, discordUrl: null as string | null, websiteUrl: null as string | null, storeUrl: null as string | null } : null;

  useEffect(() => {
    if (!config) return;

    const { name, slug: s, keywords, hosts, description, artworkUrl } = config;
    const url = `https://podcap.io/podcasts/${s}`;

    document.title = `${name} Podcast Summary, Latest Episode Recap | PodCap`;

    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };

    setMeta("name", "description", `Get free daily ${name} podcast summaries and episode recaps. ${name} podcast recap of every new episode by ${hosts} — ${description} delivered to your inbox.`);
    setMeta("name", "keywords", `${name} podcast summary, ${name} episode summary, ${name} podcast recap, ${name} recap, ${keywords}, podcast summary, daily podcast recap`);
    setMeta("property", "og:title", `${name} Podcast Summary, Latest Episode Recap | PodCap`);
    setMeta("property", "og:description", `Daily ${name} podcast summaries and episode recaps. ${description.charAt(0).toUpperCase() + description.slice(1)} — delivered free to your inbox.`);
    setMeta("property", "og:url", url);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", "PodCap");
    if (artworkUrl) {
      setMeta("property", "og:image", artworkUrl);
      setMeta("name", "twitter:card", "summary_large_image");
      setMeta("name", "twitter:image", artworkUrl);
    } else {
      setMeta("name", "twitter:card", "summary");
    }
    setMeta("name", "twitter:title", `${name} Podcast Summary, Latest Episode Recap | PodCap`);
    setMeta("name", "twitter:description", `Free daily ${name} podcast summaries and episode recaps delivered to your inbox.`);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) { canonical = document.createElement("link"); canonical.setAttribute("rel", "canonical"); document.head.appendChild(canonical); }
    canonical.setAttribute("href", url);

    let jsonLd = document.querySelector('script[data-seo="podcast-landing"]');
    if (!jsonLd) { jsonLd = document.createElement("script"); jsonLd.setAttribute("type", "application/ld+json"); jsonLd.setAttribute("data-seo", "podcast-landing"); document.head.appendChild(jsonLd); }
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": `${name} Podcast Summary, Latest Episode Recap`,
      "description": `Free daily ${name} podcast summary and episode recap. ${description.charAt(0).toUpperCase() + description.slice(1)} delivered to your inbox.`,
      "url": url,
      "publisher": { "@type": "Organization", "name": "PodCap", "url": "https://podcap.io" },
      "about": { "@type": "PodcastSeries", "name": name },
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD", "description": `Free daily ${name} podcast recap delivered by email` },
    });

    return () => {
      const ld = document.querySelector('script[data-seo="podcast-landing"]');
      if (ld) ld.remove();
    };
  }, [config?.name]);

  if (user) {
    navigate("/dashboard");
    return null;
  }

  if (!config && !dbEntry && !staticConfig) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <PodCapHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Podcast not found</h1>
            <p className="text-muted-foreground mb-4">We couldn't find a landing page for this podcast.</p>
            <a href="/podcasts" className="text-primary hover:underline">Browse all podcasts</a>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const { name, hosts, category, itunesId, artworkUrl, spotifyUrl, youtubeUrl, avgEpisodeLength, frequency, totalEpisodes, yearStarted, knownFor, hostBios, relatedSlugs, aboutPodcast, description } = config;
  const twitterHandle = (config as any).twitterHandle as string | null | undefined;
  const instagramUrl = (config as any).instagramUrl as string | null | undefined;
  const tiktokUrl = (config as any).tiktokUrl as string | null | undefined;
  const facebookUrl = (config as any).facebookUrl as string | null | undefined;
  const discordUrl = (config as any).discordUrl as string | null | undefined;
  const websiteUrl = (config as any).websiteUrl as string | null | undefined;
  const storeUrl = (config as any).storeUrl as string | null | undefined;

  const appleUrl = config.appleUrl || `https://podcasts.apple.com/podcast/id${itunesId}`;
  const effectiveSpotifyUrl = spotifyUrl || `https://open.spotify.com/search/${encodeURIComponent(name)}`;

  const relatedPodcasts = (relatedSlugs || [])
    .map(s => getPodcastBySlug(s))
    .filter((p): p is PodcastLandingConfig => !!p)
    .slice(0, 3);

  const { data: episodeRecaps = [] } = useQuery<any[]>({
    queryKey: ["/api/podcasts", slug, "recaps"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${slug}/recaps?limit=10`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!slug,
  });

  const snapshotItems = [
    category ? { icon: Star, label: "Category", value: category } : null,
    avgEpisodeLength ? { icon: Clock, label: "Avg. Episode", value: `${avgEpisodeLength} min` } : null,
    frequency ? { icon: Calendar, label: "Frequency", value: frequency } : null,
    totalEpisodes ? { icon: Mic, label: "Episodes", value: `${totalEpisodes.toLocaleString()}+` } : null,
    yearStarted ? { icon: Calendar, label: "Since", value: `${yearStarted}` } : null,
  ].filter(Boolean) as { icon: typeof Star; label: string; value: string }[];

  return (
    <PodcastPageLayout
      config={config}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === "episodes" && (
        <section className="pb-16" data-testid="section-episode-list">
          {episodeRecaps.length > 0 ? (
            <>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mb-5">
                Quick summaries of the latest episodes — key takeaways in minutes, not hours.
              </p>
              <div className="space-y-5">
                {episodeRecaps.slice(0, 10).map((ep: any) => (
                  <EpisodeCard
                    key={ep.episodeSlug}
                    episodeSlug={ep.episodeSlug}
                    podcastSlug={slug}
                    publishDate={ep.publishDate}
                    episodeTitle={ep.episodeTitle}
                    tldl={ep.tldl}
                    duration={ep.duration}
                  />
                ))}
              </div>
              <div className="flex justify-center mt-8">
                <Link href={`/podcasts/${slug}/episodes`}>
                  <span className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-display font-bold text-base bg-primary/[0.06] text-primary hover:bg-primary/[0.1] transition-colors" data-testid="link-view-all-episodes">
                    View All Episode Recaps
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </Link>
              </div>
            </>
          ) : (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-primary/[0.06] flex items-center justify-center mx-auto mb-4">
                <Mic className="w-6 h-6 text-primary/30" />
              </div>
              <p className="text-muted-foreground font-medium">Episode recaps are being generated.</p>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]/60 mt-1">Check back soon for the latest summaries.</p>
            </div>
          )}
        </section>
      )}

      {activeTab === "search" && (
        <section className="pb-16">
          <TranscriptSearch slug={slug || ""} podcastName={name} />
        </section>
      )}

      {activeTab === "ask" && (
        <section className="pb-16">
          <AskPodcast slug={slug || ""} podcastName={name} />
        </section>
      )}

      {activeTab === "about" && (
        <section className="pb-16" data-testid="section-about-podcast">
          {aboutPodcast && (
            <div className="bg-white border border-black/[0.06] rounded-xl p-6 mb-6" data-testid="text-about-podcast">
              <p className="text-[15px] leading-[1.85] text-foreground/75">{aboutPodcast}</p>
            </div>
          )}

          {snapshotItems.length > 0 && (
            <div className="mb-6" data-testid="section-snapshot">
              <h3 className="text-[15px] font-bold text-muted-foreground uppercase tracking-wider mb-3">At a Glance</h3>
              <div className={`grid gap-3 grid-cols-2 ${snapshotItems.length <= 2 ? "sm:grid-cols-2" : snapshotItems.length === 3 ? "sm:grid-cols-3" : snapshotItems.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3 lg:grid-cols-5"}`}>
                {snapshotItems.map((item, i) => (
                  <div key={i} className="bg-white border border-black/[0.06] rounded-xl px-4 py-4" data-testid={`snapshot-${item.label.toLowerCase().replace(/\s/g, "-")}`}>
                    <p className="text-[15px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1">{item.label}</p>
                    <p className="text-base font-bold text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {knownFor && knownFor.length > 0 && (
            <div className="mb-6" data-testid="section-known-for">
              <h3 className="text-[15px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Known For</h3>
              <div className="bg-white border border-black/[0.06] rounded-xl p-5">
                <ul className="space-y-3">
                  {knownFor.map((item, i) => (
                    <li key={i} className="flex items-start gap-3" data-testid={`known-for-${i}`}>
                      <span className="shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-primary" />
                      <span className="text-[17px] text-foreground/75 leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {(() => {
            const richHosts = podcastHosts && podcastHosts.length > 0 ? podcastHosts : null;
            const fallbackHosts = !richHosts && hostBios && hostBios.length > 0 ? hostBios : null;
            const displayHosts = richHosts || fallbackHosts;
            if (!displayHosts || displayHosts.length === 0) return null;
            return (
              <div className="mb-6" data-testid="section-host-bios">
                <h3 className="text-[15px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                  {displayHosts.length === 1 ? "Host" : "Hosts"}
                </h3>
                <div className={`grid gap-3 ${displayHosts.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                  {displayHosts.map((host: any, i: number) => (
                    <div key={host.id || i} className="bg-white border border-black/[0.06] rounded-xl p-5" data-testid={`host-bio-${i}`}>
                      <div className="flex items-center gap-3 mb-3">
                        {host.photoUrl ? (
                          <img src={host.photoUrl} alt={host.name} className="w-12 h-12 rounded-full object-cover shrink-0 ring-2 ring-black/[0.04]" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-primary/[0.08] flex items-center justify-center shrink-0">
                            <Users className="w-5 h-5 text-primary/60" />
                          </div>
                        )}
                        <h4 className="text-[15px] font-bold text-foreground">{host.name}</h4>
                      </div>
                      {host.bio && (() => {
                        const paragraphs = host.bio.split(/\n\n+/).filter((p: string) => p.trim());
                        return (
                          <div className="text-base text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed mb-3 space-y-2.5">
                            {paragraphs.map((para: string, pi: number) => {
                              const lines = para.split('\n').filter((l: string) => l.trim());
                              const bulletLines = lines.filter((l: string) => /^[•\-\*]\s/.test(l.trim()));
                              if (bulletLines.length > 0 && bulletLines.length === lines.length) {
                                return (
                                  <ul key={pi} className="space-y-1 pl-1">
                                    {bulletLines.map((line: string, li: number) => (
                                      <li key={li} className="flex items-start gap-2">
                                        <span className="text-primary/50 mt-[3px] text-xs">●</span>
                                        <span>{line.replace(/^[•\-\*]\s*/, '')}</span>
                                      </li>
                                    ))}
                                  </ul>
                                );
                              }
                              const hasInlineBullets = para.includes('•') && !para.startsWith('•');
                              if (hasInlineBullets) {
                                const parts = para.split(/\s*•\s*/);
                                const intro = parts[0];
                                const items = parts.slice(1).filter((s: string) => s.trim());
                                return (
                                  <div key={pi}>
                                    {intro && <p className="mb-1.5">{intro}</p>}
                                    {items.length > 0 && (
                                      <ul className="space-y-1 pl-1">
                                        {items.map((item: string, li: number) => (
                                          <li key={li} className="flex items-start gap-2">
                                            <span className="text-primary/50 mt-[3px] text-xs">●</span>
                                            <span>{item.trim()}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                );
                              }
                              return <p key={pi}>{para}</p>;
                            })}
                          </div>
                        );
                      })()}
                      {(host.twitterHandle || host.linkedinUrl || host.instagramHandle || host.websiteUrl) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {host.twitterHandle && (
                            <a href={`https://x.com/${host.twitterHandle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[15px] font-medium text-muted-foreground hover:text-foreground bg-black/[0.03] hover:bg-black/[0.06] rounded-lg transition-colors" data-testid={`host-twitter-${i}`}>
                              <SiX className="w-3 h-3" />
                              {host.twitterHandle.startsWith('@') ? host.twitterHandle : `@${host.twitterHandle}`}
                            </a>
                          )}
                          {host.linkedinUrl && (
                            <a href={host.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[15px] font-medium text-muted-foreground hover:text-foreground bg-black/[0.03] hover:bg-black/[0.06] rounded-lg transition-colors" data-testid={`host-linkedin-${i}`}>
                              <SiLinkedin className="w-3 h-3" />
                              LinkedIn
                            </a>
                          )}
                          {host.instagramHandle && (
                            <a href={`https://instagram.com/${host.instagramHandle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[15px] font-medium text-muted-foreground hover:text-foreground bg-black/[0.03] hover:bg-black/[0.06] rounded-lg transition-colors" data-testid={`host-instagram-${i}`}>
                              <SiInstagram className="w-3 h-3" />
                              {host.instagramHandle.startsWith('@') ? host.instagramHandle : `@${host.instagramHandle}`}
                            </a>
                          )}
                          {host.websiteUrl && (
                            <a href={host.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[15px] font-medium text-muted-foreground hover:text-foreground bg-black/[0.03] hover:bg-black/[0.06] rounded-lg transition-colors" data-testid={`host-website-${i}`}>
                              <ExternalLink className="w-3 h-3" />
                              Website
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="mb-6" data-testid="section-listen">
            <h3 className="text-[15px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Listen On</h3>
            <div className="flex flex-wrap gap-2.5">
              <a
                href={appleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                data-testid="link-apple-podcasts"
              >
                <SiApplepodcasts className="w-4 h-4 text-[#872EC4]" />
                Apple Podcasts
              </a>
              <a
                href={effectiveSpotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                data-testid="link-spotify"
              >
                <SiSpotify className="w-4 h-4 text-[#1DB954]" />
                Spotify
              </a>
              {youtubeUrl && (
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                  data-testid="link-youtube"
                >
                  <SiYoutube className="w-4 h-4 text-[#FF0000]" />
                  YouTube
                </a>
              )}
              {twitterHandle && (
                <a
                  href={`https://x.com/${twitterHandle.replace("@", "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                  data-testid="link-x-profile"
                >
                  <SiX className="w-3.5 h-3.5" />
                  {twitterHandle}
                </a>
              )}
              {instagramUrl && (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                  data-testid="link-instagram"
                >
                  <SiInstagram className="w-4 h-4 text-[#E4405F]" />
                  Instagram
                </a>
              )}
              {tiktokUrl && (
                <a
                  href={tiktokUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                  data-testid="link-tiktok"
                >
                  <SiTiktok className="w-4 h-4" />
                  TikTok
                </a>
              )}
              {facebookUrl && (
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                  data-testid="link-facebook"
                >
                  <SiFacebook className="w-4 h-4 text-[#1877F2]" />
                  Facebook
                </a>
              )}
              {discordUrl && (
                <a
                  href={discordUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                  data-testid="link-discord"
                >
                  <SiDiscord className="w-4 h-4 text-[#5865F2]" />
                  Discord
                </a>
              )}
              {websiteUrl && (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                  data-testid="link-website"
                >
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  Website
                </a>
              )}
              {storeUrl && (
                <a
                  href={storeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-base font-medium text-foreground transition-colors"
                  data-testid="link-store"
                >
                  <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                  Store
                </a>
              )}
            </div>
          </div>

          <p className="text-[15px] text-muted-foreground/40 mt-8">
            PodCap is not affiliated with, endorsed by, or sponsored by {name}, {hosts}, or any podcast listed on this site.
          </p>
        </section>
      )}

      {activeTab === "discover" && (
        <section className="pb-16" data-testid="section-discover">
          {relatedPodcasts.length > 0 ? (
            <>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mb-5">
                Podcasts that listeners of {name} also enjoy — with recaps available on PodCap.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {relatedPodcasts.map((rp) => (
                  <a
                    key={rp.slug}
                    href={`/podcasts/${rp.slug}`}
                    className="bg-white border border-black/[0.06] rounded-xl p-4 flex items-center gap-4 hover:border-primary/[0.15] hover:shadow-md hover:shadow-black/[0.04] transition-all group"
                    data-testid={`related-podcast-${rp.slug}`}
                  >
                    {rp.artworkUrl ? (
                      <img src={rp.artworkUrl} alt={rp.name} className="w-14 h-14 rounded-xl object-cover shadow-sm shadow-black/[0.06] shrink-0 ring-1 ring-black/[0.04]" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-primary/[0.06] flex items-center justify-center shrink-0">
                        <Headphones className="w-5 h-5 text-primary/30" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold text-foreground truncate group-hover:text-primary transition-colors">{rp.name}</p>
                      <p className="text-[15px] text-muted-foreground/60 mt-0.5 uppercase tracking-wider font-semibold">{rp.category}</p>
                    </div>
                    <ArrowRight className="shrink-0 w-4 h-4 text-muted-foreground/20 group-hover:text-primary transition-colors" />
                  </a>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-primary/[0.06] flex items-center justify-center mx-auto mb-4">
                <Compass className="w-6 h-6 text-primary/30" />
              </div>
              <p className="text-muted-foreground font-medium">Discovering similar podcasts...</p>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]/60 mt-1">We're finding shows you might enjoy.</p>
            </div>
          )}
        </section>
      )}
    </PodcastPageLayout>
  );
}
