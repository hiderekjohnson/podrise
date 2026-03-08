import { useParams, Link, useLocation } from "wouter";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getPodcastBySlug } from "../data/podcastLandingData";
import { EpisodeCard } from "@/components/EpisodeCard";
import { PodcastPageLayout, type PodcastTab } from "@/components/PodcastPageLayout";

export default function EpisodeArchivePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";
  const [, navigate] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const perPage = 25;

  const podcastConfig = getPodcastBySlug(slug);

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
  } as any : podcastConfig ? { ...podcastConfig, twitterHandle: null } : null;

  const offset = (page - 1) * perPage;

  const { data: recapData, isLoading } = useQuery<{ recaps: any[]; total: number }>({
    queryKey: ["/api/podcasts", slug, "recaps", "page", page],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${slug}/recaps?limit=${perPage}&offset=${offset}`);
      if (!res.ok) return { recaps: [], total: 0 };
      return res.json();
    },
    enabled: !!slug,
  });

  const episodes = recapData?.recaps || [];
  const total = recapData?.total || 0;
  const totalPages = Math.ceil(total / perPage);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug, page]);

  useEffect(() => {
    if (!config) {
      document.title = "Podcast Not Found | PodCap";
      return;
    }
    const name = config.name;
    const pageTitle = page > 1
      ? `All ${name} Episode Recaps — Page ${page} | PodCap`
      : `All ${name} Episode Recaps | PodCap`;
    const pageDescription = `Browse every ${name} episode recap on PodCap. ${total} episodes summarized with key insights and takeaways.`;
    const canonicalUrl = page > 1
      ? `https://podcap.io/podcasts/${slug}/episodes?page=${page}`
      : `https://podcap.io/podcasts/${slug}/episodes`;

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
    setMeta('meta[property="og:url"]', "content", canonicalUrl);

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
  }, [config, slug, page, total]);

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-display font-bold text-foreground mb-3" data-testid="text-not-found">Podcast not found</h1>
          <p className="text-muted-foreground mb-6">We don't have recaps for this podcast yet.</p>
          <Link href="/podcasts">
            <span className="text-primary font-semibold hover:underline" data-testid="link-back">Browse all podcasts</span>
          </Link>
        </div>
      </div>
    );
  }

  const handleTabChange = (tab: PodcastTab) => {
    if (tab === "episodes") return;
    navigate(`/podcasts/${slug}?tab=${tab}`);
  };

  return (
    <PodcastPageLayout
      config={config}
      activeTab="episodes"
      onTabChange={handleTabChange}
    >
      <section className="pb-16" data-testid="section-all-episodes">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground" data-testid="text-archive-title">
                All {config.name} Recaps
              </h2>
              <p className="text-sm text-muted-foreground mt-1" data-testid="text-episode-count">
                {total} episode {total === 1 ? "recap" : "recaps"}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="space-y-5">
                {episodes.map((ep) => (
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

              {episodes.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-muted-foreground">No episode recaps found for this page.</p>
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-10" data-testid="pagination">
                  {page > 1 ? (
                    <Link href={`/podcasts/${slug}/episodes${page > 2 ? `?page=${page - 1}` : ""}`}>
                      <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-primary bg-primary/[0.06] hover:bg-primary/[0.1] transition-colors" data-testid="link-prev-page">
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </span>
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground/40 cursor-not-allowed">
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </span>
                  )}
                  <span className="text-sm text-muted-foreground" data-testid="text-page-info">
                    Page {page} of {totalPages}
                  </span>
                  {page < totalPages ? (
                    <Link href={`/podcasts/${slug}/episodes?page=${page + 1}`}>
                      <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-primary bg-primary/[0.06] hover:bg-primary/[0.1] transition-colors" data-testid="link-next-page">
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </span>
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground/40 cursor-not-allowed">
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </motion.div>
      </section>
    </PodcastPageLayout>
  );
}
