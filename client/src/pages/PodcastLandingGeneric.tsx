import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams, Link } from "wouter";
import { Loader2, ArrowRight, Clock, Calendar, Mic, Users, Star, Search, X, Compass, Headphones } from "lucide-react";
import { SiX, SiApplepodcasts, SiSpotify, SiYoutube } from "react-icons/si";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import { PodCapHeader } from "@/components/PodCapHeader";
import { PodcastPageLayout, type PodcastTab } from "@/components/PodcastPageLayout";

import { getPodcastBySlug, PODCAST_LANDINGS } from "@/data/podcastLandingData";
import type { PodcastLandingConfig } from "@/data/podcastLandingData";
import logoPath from "@assets/Podcap_logo_1772731738179.png";
import { EpisodeCard } from "@/components/EpisodeCard";

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
      <p className="text-sm text-muted-foreground mb-4">
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
              <span className="text-sm font-medium">Searching transcripts...</span>
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
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Found in {data.total} episode{data.total !== 1 ? "s" : ""}
                </p>
                <span className="text-xs text-muted-foreground/50">
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
                              <p className="text-[11px] text-muted-foreground/50 mt-0.5 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {dateStr}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-primary/[0.08] text-primary">
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
                              <span className="shrink-0 text-[11px] font-bold text-primary/70 bg-primary/[0.06] rounded px-1.5 py-0.5 mt-0.5 font-mono">
                                {hit.timestampLabel}
                              </span>
                            )}
                            <span className="flex-1 text-[13px] text-muted-foreground leading-relaxed line-clamp-2">{highlightMatch(hit.text, data.query)}</span>
                            <span className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-primary/50 group-hover:text-primary mt-0.5 transition-colors whitespace-nowrap">
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


export default function PodcastLandingGeneric() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const staticConfig = getPodcastBySlug(slug || "");
  const [, navigate] = useLocation();
  const { data: user } = useAuth();

  const initialTab = (() => {
    const urlTab = new URLSearchParams(window.location.search).get("tab");
    if (urlTab === "search" || urlTab === "about" || urlTab === "discover" || urlTab === "episodes") return urlTab;
    return "episodes" as PodcastTab;
  })();
  const [activeTab, setActiveTab] = useState<PodcastTab>(initialTab);

  const { data: dbEntry } = useQuery<any>({
    queryKey: ["/api/podcasts/by-slug", slug],
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
  } as PodcastLandingConfig & { twitterHandle?: string | null } : staticConfig ? { ...staticConfig, twitterHandle: null as string | null } : null;

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
              <p className="text-sm text-muted-foreground mb-5">
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
                  <span className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-display font-bold text-sm bg-primary/[0.06] text-primary hover:bg-primary/[0.1] transition-colors" data-testid="link-view-all-episodes">
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
              <p className="text-sm text-muted-foreground/60 mt-1">Check back soon for the latest summaries.</p>
            </div>
          )}
        </section>
      )}

      {activeTab === "search" && (
        <section className="pb-16">
          <TranscriptSearch slug={slug || ""} podcastName={name} />
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
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">At a Glance</h3>
              <div className={`grid gap-3 grid-cols-2 ${snapshotItems.length <= 2 ? "sm:grid-cols-2" : snapshotItems.length === 3 ? "sm:grid-cols-3" : snapshotItems.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3 lg:grid-cols-5"}`}>
                {snapshotItems.map((item, i) => (
                  <div key={i} className="bg-white border border-black/[0.06] rounded-xl px-4 py-4" data-testid={`snapshot-${item.label.toLowerCase().replace(/\s/g, "-")}`}>
                    <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1">{item.label}</p>
                    <p className="text-base font-bold text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {knownFor && knownFor.length > 0 && (
            <div className="mb-6" data-testid="section-known-for">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Known For</h3>
              <div className="bg-white border border-black/[0.06] rounded-xl p-5">
                <ul className="space-y-3">
                  {knownFor.map((item, i) => (
                    <li key={i} className="flex items-start gap-3" data-testid={`known-for-${i}`}>
                      <span className="shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-primary" />
                      <span className="text-sm text-foreground/75 leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {hostBios && hostBios.length > 0 && (
            <div className="mb-6" data-testid="section-host-bios">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                {hostBios.length === 1 ? "Host" : "Hosts"}
              </h3>
              <div className={`grid gap-3 ${hostBios.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                {hostBios.map((host: any, i: number) => (
                  <div key={i} className="bg-white border border-black/[0.06] rounded-xl p-5" data-testid={`host-bio-${i}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-primary/[0.08] flex items-center justify-center shrink-0">
                        <Users className="w-[18px] h-[18px] text-primary/60" />
                      </div>
                      <h4 className="text-[15px] font-bold text-foreground">{host.name}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{host.bio}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-6" data-testid="section-listen">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Listen On</h3>
            <div className="flex flex-wrap gap-2.5">
              <a
                href={appleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-sm font-medium text-foreground transition-colors"
                data-testid="link-apple-podcasts"
              >
                <SiApplepodcasts className="w-4 h-4 text-[#872EC4]" />
                Apple Podcasts
              </a>
              <a
                href={effectiveSpotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-sm font-medium text-foreground transition-colors"
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
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-sm font-medium text-foreground transition-colors"
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
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-black/[0.02] border border-black/[0.06] rounded-xl text-sm font-medium text-foreground transition-colors"
                  data-testid="link-x-profile"
                >
                  <SiX className="w-3.5 h-3.5" />
                  {twitterHandle}
                </a>
              )}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground/40 mt-8">
            PodCap is not affiliated with, endorsed by, or sponsored by {name}, {hosts}, or any podcast listed on this site.
          </p>
        </section>
      )}

      {activeTab === "discover" && (
        <section className="pb-16" data-testid="section-discover">
          {relatedPodcasts.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground mb-5">
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
                      <p className="text-xs text-muted-foreground/60 mt-0.5 uppercase tracking-wider font-semibold">{rp.category}</p>
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
              <p className="text-sm text-muted-foreground/60 mt-1">We're finding shows you might enjoy.</p>
            </div>
          )}
        </section>
      )}
    </PodcastPageLayout>
  );
}
