import { useParams, Link } from "wouter";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Loader2, Search, FileText, ChevronUp, Copy, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getPodcastBySlug } from "../data/podcastLandingData";
import { EpisodePageLayout } from "@/components/EpisodePageLayout";

interface TranscriptSegment {
  id: number;
  text: string;
  anchorId: string;
  timestampLabel: string | null;
  speakerName: string | null;
  sequenceIndex: number;
}

interface TranscriptMeta {
  podcastName: string;
  podcastSlug: string;
  episodeTitle: string;
  episodeSlug: string;
  publishDate: string;
  duration: string;
  artworkUrl: string;
  hosts: string;
  appleEpisodeUrl: string;
  spotifyEpisodeUrl?: string;
  totalSegments: number;
  totalWords: number;
  readingMinutes: number;
  hasTimestamps: boolean;
}

function isValidSpeaker(name: string | null): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 30) return false;
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 4) return false;
  if (!/^[A-Z]/.test(trimmed)) return false;
  if (!/^[A-Za-z0-9\s'\-&.]+$/.test(trimmed)) return false;
  if (/^(And|But|Or|The|A|An|So|If|It|This|That|Then|Also|Second|Third|First|In|On|At|For|With|From|What|How|Why|Where|When|Who)\s/i.test(trimmed)) return false;
  return true;
}

function formatSegmentText(text: string): string[] {
  if (text.length < 300) return [text];
  const paragraphs: string[] = [];
  let current = "";
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (current.length + sentence.length > 250 && current.length > 0) {
      paragraphs.push(current.trim());
      current = sentence;
    } else {
      current += (current ? " " : "") + sentence;
    }
  }
  if (current.trim()) paragraphs.push(current.trim());
  return paragraphs.length > 0 ? paragraphs : [text];
}

function highlightText(text: string, query: string) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} className="bg-primary/15 text-inherit rounded-sm px-px">{part}</mark> : part
  );
}

function CopyLinkButton({ anchorId }: { anchorId: string }) {
  const [copied, setCopied] = useState(false);
  const url = `https://podcap.io${window.location.pathname}#${anchorId}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [url]);

  return (
    <button
      onClick={handleCopy}
      title="Copy link to this moment"
      aria-label="Copy link"
      className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto p-0.5 rounded text-muted-foreground/60 hover:text-primary"
      data-testid={`button-copy-${anchorId}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-[#6366F1]" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CopyFullTranscriptButton({ segments }: { segments: TranscriptSegment[] }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const fullText = segments
      .map((seg) => {
        const parts: string[] = [];
        if (seg.timestampLabel) parts.push(`[${seg.timestampLabel}]`);
        if (isValidSpeaker(seg.speakerName)) parts.push(`${seg.speakerName}:`);
        parts.push(seg.text);
        return parts.join(" ");
      })
      .join("\n\n");

    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [segments]);

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[15px] font-semibold transition-all ${
        copied
          ? "bg-[#EEF2FF] text-[#6366F1]"
          : "bg-primary/[0.06] text-primary hover:bg-primary/[0.12]"
      }`}
      data-testid="button-copy-transcript"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          Copy Transcript
        </>
      )}
    </button>
  );
}

export default function EpisodeTranscriptPage() {
  const params = useParams<{ podcastSlug: string; episodeSlug: string }>();
  const podcastSlug = params.podcastSlug || "";
  const episodeSlug = params.episodeSlug || "";

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [showScrollTop, setShowScrollTop] = useState(false);

  const { data, isLoading } = useQuery<{ segments: TranscriptSegment[]; meta: TranscriptMeta }>({
    queryKey: ["/api/podcasts", podcastSlug, episodeSlug, "transcript-segments"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/${episodeSlug}/transcript-segments`);
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

  const podcastConfig = getPodcastBySlug(podcastSlug);
  const segments = data?.segments || [];
  const meta = data?.meta;

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const q = urlParams.get("q");
    if (q) {
      setSearchQuery(q);
      setDebouncedQuery(q);
    }
  }, []);

  useEffect(() => {
    if (!meta) return;
    const hash = window.location.hash;
    if (hash) {
      setTimeout(() => {
        const el = document.getElementById(hash.slice(1));
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("highlighted");
        }
      }, 200);
    }
  }, [meta]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [podcastSlug, episodeSlug]);

  useEffect(() => {
    if (!meta) return;
    const pageTitle = `${meta.podcastName}, ${meta.episodeTitle}, Full Transcript`;
    const pageDescription = `Read the full transcript of "${meta.episodeTitle}" from ${meta.podcastName}. Timestamped, searchable transcript with direct links to any moment.`;
    const canonicalUrl = `https://podcap.io/podcasts/${podcastSlug}/${episodeSlug}/transcript`;

    document.title = pageTitle;

    const setMeta = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector);
      if (el) {
        el.setAttribute(attr, value);
      } else {
        const m = document.createElement("meta");
        if (selector.includes("property=")) {
          m.setAttribute("property", selector.match(/property="([^"]+)"/)?.[1] || "");
        } else if (selector.includes("name=")) {
          m.setAttribute("name", selector.match(/name="([^"]+)"/)?.[1] || "");
        }
        m.setAttribute(attr, value);
        document.head.appendChild(m);
      }
    };

    setMeta('meta[name="description"]', "content", pageDescription);
    setMeta('meta[property="og:title"]', "content", pageTitle);
    setMeta('meta[property="og:description"]', "content", pageDescription);
    setMeta('meta[property="og:image"]', "content", meta.artworkUrl);
    setMeta('meta[property="og:url"]', "content", canonicalUrl);
    setMeta('meta[property="og:type"]', "content", "article");
    setMeta('meta[name="twitter:card"]', "content", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "content", pageTitle);
    setMeta('meta[name="twitter:description"]', "content", pageDescription);
    setMeta('meta[name="twitter:image"]', "content", meta.artworkUrl);

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
  }, [meta, podcastSlug, episodeSlug]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(val.trim()), 200);
  }, []);

  const lowerQuery = debouncedQuery.toLowerCase();

  const { filteredSegments, matchCount } = useMemo(() => {
    if (!lowerQuery) return { filteredSegments: segments, matchCount: 0 };
    let count = 0;
    const filtered = segments.filter((seg) => {
      if (seg.text.toLowerCase().includes(lowerQuery)) {
        count++;
        return true;
      }
      return false;
    });
    return { filteredSegments: filtered, matchCount: count };
  }, [segments, lowerQuery]);

  const handleTimestampClick = useCallback((e: React.MouseEvent, anchorId: string) => {
    e.preventDefault();
    history.replaceState(null, "", "#" + anchorId);
    document.querySelectorAll(".seg-highlighted").forEach((s) => s.classList.remove("seg-highlighted"));
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("seg-highlighted");
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data || !meta || !podcastConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-display font-bold text-foreground mb-3" data-testid="text-not-found">Transcript not found</h1>
          <p className="text-muted-foreground mb-6">This transcript doesn't exist yet.</p>
          <Link href={podcastConfig ? `/podcasts/${podcastSlug}` : "/podcasts"}>
            <span className="text-primary font-semibold hover:underline" data-testid="link-back">
              {podcastConfig ? `Back to ${podcastConfig.name}` : "Browse all podcasts"}
            </span>
          </Link>
        </div>
      </div>
    );
  }

  const episodeData = {
    podcastName: meta.podcastName,
    episodeTitle: meta.episodeTitle,
    publishDate: meta.publishDate,
    artworkUrl: meta.artworkUrl,
    duration: meta.duration,
    hosts: meta.hosts,
    appleEpisodeUrl: meta.appleEpisodeUrl,
    spotifyEpisodeUrl: meta.spotifyEpisodeUrl,
  };

  return (
    <EpisodePageLayout
      episode={episodeData}
      podcastSlug={podcastSlug}
      episodeSlug={episodeSlug}
      podcastConfig={podcastConfig}
      activeTab="transcript"
      allRecaps={allRecaps}
    >
      <div>
        <p className="text-base text-[#52525B] dark:text-[#A1A1AA] mb-6" data-testid="text-recap-link">
          Too long to read?{" "}
          <Link
            href={`/podcasts/${podcastSlug}/${episodeSlug}`}
            className="text-primary font-semibold hover:underline"
            data-testid="link-view-recap"
          >
            View the 2-minute episode recap
          </Link>
          .
        </p>

        <div
          className="flex items-center gap-4 flex-wrap text-base text-[#52525B] dark:text-[#A1A1AA] px-4 py-3 bg-white border border-black/[0.06] rounded-xl mb-4"
          data-testid="stats-bar"
        >
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            {meta.totalWords.toLocaleString()} words
          </div>
          <div className="w-px h-4 bg-black/[0.08]" />
          <div>~{meta.readingMinutes} min read</div>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
          <input
            type="text"
            id="transcript-search"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search episode..."
            autoComplete="off"
            className="w-full h-11 pl-10 pr-4 border border-black/[0.08] rounded-xl bg-white text-sm text-foreground outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/10 transition-all placeholder:text-muted-foreground/50"
            data-testid="input-transcript-search"
          />
          {debouncedQuery && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[15px] text-muted-foreground/50 pointer-events-none" data-testid="text-search-count">
              {matchCount} match{matchCount !== 1 ? "es" : ""}
            </span>
          )}
        </div>

        <div className="bg-white border border-black/[0.06] dark:bg-card dark:border-white/[0.06] rounded-2xl overflow-hidden" data-testid="transcript-wrapper">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <span className="text-base font-bold text-foreground">Full Transcript</span>
            </div>
            <CopyFullTranscriptButton segments={filteredSegments} />
          </div>
          <article className="space-y-1.5 p-4 sm:p-5" data-testid="segments-container">
            {filteredSegments.map((seg) => {
              const validSpeaker = isValidSpeaker(seg.speakerName);
              const hasMeta = seg.timestampLabel || validSpeaker;
              const paragraphs = formatSegmentText(seg.text);

              return (
                <div
                  key={seg.id}
                  id={seg.anchorId}
                  className={`group rounded-[10px] scroll-mt-20 transition-colors duration-300 ${
                    hasMeta
                      ? "bg-slate-50/70 dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.04] p-3.5 sm:px-4"
                      : "bg-transparent border border-transparent px-4 py-1"
                  } ${debouncedQuery && seg.text.toLowerCase().includes(lowerQuery) ? "border-primary/20" : ""}`}
                  data-testid={`segment-${seg.anchorId}`}
                >
                  {hasMeta && (
                    <div className="flex items-center gap-2.5 mb-1.5 min-h-[22px]">
                      {seg.timestampLabel && (
                        <a
                          href={`#${seg.anchorId}`}
                          onClick={(e) => handleTimestampClick(e, seg.anchorId)}
                          className="text-[15px] font-bold text-primary bg-primary/[0.08] px-2 py-0.5 rounded-md font-mono hover:bg-primary/[0.14] transition-colors no-underline tabular-nums"
                          data-testid={`ts-${seg.anchorId}`}
                        >
                          {seg.timestampLabel}
                        </a>
                      )}
                      {validSpeaker && (
                        <span className="text-base font-bold text-foreground" data-testid={`speaker-${seg.anchorId}`}>
                          {seg.speakerName}
                        </span>
                      )}
                      <CopyLinkButton anchorId={seg.anchorId} />
                    </div>
                  )}
                  {paragraphs.map((p, i) => (
                    <p key={i} className={`text-[15px] leading-[1.75] text-slate-700 dark:text-slate-300 ${i > 0 ? "mt-2" : ""}`}>
                      {debouncedQuery ? highlightText(p, debouncedQuery) : p}
                    </p>
                  ))}
                </div>
              );
            })}
          </article>
        </div>

        {showScrollTop && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-6 right-6 w-11 h-11 rounded-full bg-white border border-black/[0.08] shadow-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:scale-110 transition-all z-40"
            aria-label="Scroll to top"
            data-testid="button-scroll-top"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
        )}
      </div>
    </EpisodePageLayout>
  );
}
