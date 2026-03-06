import { useParams, Link } from "wouter";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Calendar, Clock } from "lucide-react";
import { getEpisodesByPodcastPaginated } from "../data/episodeRecaps";
import { getPodcastBySlug } from "../data/podcastLandingData";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

export default function EpisodeArchivePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";

  const searchParams = new URLSearchParams(window.location.search);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const perPage = 25;

  const podcastConfig = getPodcastBySlug(slug);
  const { episodes, totalPages, total } = getEpisodesByPodcastPaginated(slug, page, perPage);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug, page]);

  useEffect(() => {
    if (!podcastConfig) {
      document.title = "Podcast Not Found | PodCap";
      return;
    }
    const name = podcastConfig.name;
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
  }, [podcastConfig, slug, page, total]);

  if (!podcastConfig) {
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

  const name = podcastConfig.name;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-black/[0.04]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/">
            <img src={logoPath} alt="PodCap" className="h-7" data-testid="link-home-logo" />
          </Link>
          <Link href={`/podcasts/${slug}`}>
            <span className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-podcast-hub">
              ← {name}
            </span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center gap-4 mb-2">
            <img
              src={podcastConfig.artworkUrl}
              alt={name}
              className="w-14 h-14 rounded-xl object-cover shadow-md shadow-black/[0.06] ring-1 ring-black/[0.04]"
              data-testid="img-podcast-artwork"
            />
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground" data-testid="text-archive-title">
                All {name} Recaps
              </h1>
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
          className="mt-8"
        >
          <div className="space-y-3">
            {episodes.map((ep) => {
              const date = new Date(ep.publishDate + "T00:00:00");
              const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              return (
                <Link key={ep.episodeSlug} href={`/podcasts/${slug}/${ep.episodeSlug}`}>
                  <div
                    className="bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-xl px-5 py-4 hover:shadow-md hover:shadow-black/[0.04] hover:border-primary/[0.12] transition-all cursor-pointer group"
                    data-testid={`card-episode-${ep.episodeSlug}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold text-foreground group-hover:text-primary transition-colors leading-snug">{ep.episodeTitle}</p>
                        <p className="text-[15px] text-muted-foreground mt-2 line-clamp-2">{ep.tldl}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground/70">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatted}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {ep.duration}
                          </span>
                        </div>
                      </div>
                      <span className="flex items-center gap-1 text-sm font-medium text-primary/60 group-hover:text-primary shrink-0 mt-1 transition-colors">
                        Read Summary
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
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
        </motion.div>

        <footer className="mt-16 pt-8 border-t border-black/[0.06] text-center">
          <Link href="/">
            <img src={logoPath} alt="PodCap" className="h-6 mx-auto mb-3 opacity-40" />
          </Link>
          <p className="text-xs text-muted-foreground">
            PodCap is not affiliated with {name}. Recaps are generated from publicly available episode information.
          </p>
        </footer>
      </main>
    </div>
  );
}
