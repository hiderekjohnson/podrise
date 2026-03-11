import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Clock, ArrowRight, Headphones, Calendar, Tag, Quote, BarChart3, Newspaper } from "lucide-react";
import { Footer } from "@/components/Footer";
import { PodCapWordmark } from "@/components/PodCapHeader";
import type { LandingPageRecap } from "@shared/schema";

interface DailyDropData {
  date: string;
  episodeCount: number;
  displayCount: number;
  hero: LandingPageRecap | null;
  todaysDrops: LandingPageRecap[];
  quoteEpisode: LandingPageRecap | null;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatDuration(dur: string | null | undefined) {
  if (!dur) return null;
  const parts = dur.split(":");
  if (parts.length === 3) {
    const h = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    if (h > 0) return `${h}hr ${m}min`;
    return `${m}min`;
  }
  if (parts.length === 2) {
    const m = parseInt(parts[0]);
    return `${m}min`;
  }
  return dur;
}

function SEOHead() {
  const title = "The Daily Drop — PodCap";
  const description = "Your daily podcast briefing. The best episodes, sharpest insights, and must-listen moments from across the podcast universe — curated every morning.";
  if (typeof document !== "undefined") {
    document.title = title;
    const setOrCreate = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        const [k, v] = attr === "name" ? ["name", selector.match(/name="([^"]+)"/)?.[1] || ""] : ["property", selector.match(/property="([^"]+)"/)?.[1] || ""];
        el.setAttribute(k, v);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    };
    setOrCreate('meta[name="description"]', "name", description);
    setOrCreate('meta[property="og:title"]', "property", title);
    setOrCreate('meta[property="og:description"]', "property", description);
  }
  return null;
}

export default function DailyDrop() {
  const { data, isLoading, isError } = useQuery<DailyDropData>({
    queryKey: ["/api/daily-drop"],
  });

  const isShowingLatest = data && data.episodeCount < 3;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead />

      <header className="w-full px-6 min-h-[68px] flex items-center justify-between max-w-6xl mx-auto">
        <Link href="/" className="flex items-center" data-testid="link-home">
          <PodCapWordmark />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/podcasts"
            className="text-[15px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors min-h-[44px] px-3 hidden sm:flex items-center"
            data-testid="link-browse-nav"
          >
            Browse
          </Link>
          <Link
            href="/topics"
            className="text-[15px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors min-h-[44px] px-3 hidden sm:flex items-center"
            data-testid="link-topics-nav"
          >
            Topics
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="w-full max-w-3xl mx-auto text-center px-4 sm:px-6 pt-12 sm:pt-16 pb-8 sm:pb-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center gap-3"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/[0.06] border border-primary/10 text-primary text-[13px] font-semibold uppercase tracking-wider" data-testid="badge-daily-drop">
              <Newspaper className="w-3.5 h-3.5" />
              Daily Digest
            </div>
            <h1 className="text-[2.5rem] sm:text-[3.5rem] font-display font-extrabold text-foreground leading-[1.06] tracking-[-0.03em]" data-testid="heading-daily-drop">
              The Daily Drop
            </h1>
            <div className="flex items-center gap-3 text-base text-[#3F3F46] dark:text-[#A1A1AA] font-medium mt-1" data-testid="text-drop-meta">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {data ? formatDate(data.date) : "Loading..."}
              </span>
              {data && (
                <>
                  <span className="text-border">·</span>
                  <span>
                    {data.episodeCount > 0
                      ? `${data.episodeCount} episodes dropped`
                      : "Latest episodes"}
                  </span>
                </>
              )}
            </div>
          </motion.div>
        </section>

        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
          {isLoading ? (
            <div className="space-y-8">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-card border border-border rounded-2xl p-8 animate-pulse">
                  <div className="h-6 bg-muted rounded w-1/3 mb-4" />
                  <div className="h-8 bg-muted rounded w-2/3 mb-4" />
                  <div className="h-4 bg-muted rounded w-full mb-2" />
                  <div className="h-4 bg-muted rounded w-5/6" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="bg-card border border-border rounded-2xl p-8 text-center" data-testid="daily-drop-error">
              <Headphones className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-lg font-display font-bold text-foreground mb-1">Couldn't load today's drop</p>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">Something went wrong. Try refreshing the page.</p>
            </div>
          ) : data ? (
            <div className="space-y-8">

              {data.hero && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  data-testid="section-episode-of-day"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="text-xs font-bold uppercase tracking-widest text-primary">Episode of the Day</span>
                  </div>
                  <Link
                    href={`/podcasts/${data.hero.slug}/${data.hero.episodeSlug}`}
                    className="block group"
                    data-testid="link-hero-episode"
                  >
                    <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 hover-elevate transition-all">
                      <div className="flex items-start gap-5">
                        {data.hero.artworkUrl && (
                          <img
                            src={data.hero.artworkUrl.replace(/\/\d+x\d+bb\./, "/300x300bb.")}
                            alt={data.hero.podcastName}
                            className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover shadow-md shadow-black/[0.06] shrink-0"
                            data-testid="img-hero-artwork"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-primary uppercase tracking-wide mb-1" data-testid="text-hero-show">
                            {data.hero.podcastName}
                          </p>
                          <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground leading-tight group-hover:text-primary transition-colors mb-3" data-testid="text-hero-title">
                            {data.hero.episodeTitle}
                          </h2>
                          <div className="flex flex-wrap items-center gap-3 mb-4">
                            {formatDuration(data.hero.duration) && (
                              <span className="inline-flex items-center gap-1.5 text-sm text-[#3F3F46] dark:text-[#A1A1AA] font-medium">
                                <Clock className="w-3.5 h-3.5" />
                                {formatDuration(data.hero.duration)}
                              </span>
                            )}
                            {data.hero.keyTopics && data.hero.keyTopics.slice(0, 3).map(topic => (
                              <span
                                key={topic}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/[0.06] text-xs font-semibold text-primary"
                              >
                                <Tag className="w-3 h-3" />
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed mt-4" data-testid="text-hero-summary">
                        {data.hero.tldl}
                      </p>
                      <div className="flex items-center gap-1.5 text-[15px] font-semibold text-primary mt-4">
                        <span>Read on PodCap</span>
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </Link>
                </motion.section>
              )}

              {data.todaysDrops.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  data-testid="section-todays-drops"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-foreground/40" />
                    <span className="text-xs font-bold uppercase tracking-widest text-[#3F3F46] dark:text-[#A1A1AA]">Today's Drops</span>
                  </div>
                  <div className="bg-card border border-border rounded-2xl divide-y divide-border">
                    {data.todaysDrops.map((ep, i) => (
                      <Link
                        key={ep.episodeSlug}
                        href={`/podcasts/${ep.slug}/${ep.episodeSlug}`}
                        className="flex items-center gap-4 px-5 sm:px-6 py-4 group hover:bg-muted/30 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                        data-testid={`link-drop-${i}`}
                      >
                        {ep.artworkUrl && (
                          <img
                            src={ep.artworkUrl.replace(/\/\d+x\d+bb\./, "/100x100bb.")}
                            alt={ep.podcastName}
                            className="w-11 h-11 rounded-lg object-cover shadow-sm shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-primary/70 truncate">{ep.podcastName}</p>
                          <p className="text-[15px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">{ep.episodeTitle}</p>
                        </div>
                        {formatDuration(ep.duration) && (
                          <span className="text-sm text-[#3F3F46] dark:text-[#A1A1AA] font-medium whitespace-nowrap hidden sm:block">
                            {formatDuration(ep.duration)}
                          </span>
                        )}
                        <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                      </Link>
                    ))}
                  </div>
                </motion.section>
              )}

              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                data-testid="section-stat-of-day"
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-foreground/40" />
                  <span className="text-xs font-bold uppercase tracking-widest text-[#3F3F46] dark:text-[#A1A1AA]">Stat of the Day</span>
                </div>
                <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 text-center">
                  <div className="flex items-center justify-center gap-3 mb-3">
                    <BarChart3 className="w-6 h-6 text-primary" />
                    <span className="text-4xl sm:text-5xl font-display font-extrabold text-foreground" data-testid="text-stat-number">
                      {data.episodeCount}
                    </span>
                  </div>
                  <p className="text-lg font-display font-bold text-foreground mb-1" data-testid="text-stat-label">
                    {data.episodeCount > 0 ? "episodes dropped today" : "latest episodes"}
                  </p>
                  <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]" data-testid="text-stat-context">
                    {data.episodeCount > 0
                      ? "Across every podcast PodCap tracks — that's a lot of conversations you'd rather not miss."
                      : "Here are the most recent episodes across PodCap's tracked podcasts."}
                  </p>
                </div>
              </motion.section>

              {data.quoteEpisode && data.quoteEpisode.quote && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  data-testid="section-quote-of-day"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-foreground/40" />
                    <span className="text-xs font-bold uppercase tracking-widest text-[#3F3F46] dark:text-[#A1A1AA]">Quote of the Day</span>
                  </div>
                  <Link
                    href={`/podcasts/${data.quoteEpisode.slug}/${data.quoteEpisode.episodeSlug}`}
                    className="block group"
                    data-testid="link-quote-episode"
                  >
                    <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 hover-elevate transition-all">
                      <Quote className="w-8 h-8 text-primary/20 mb-3" />
                      <p className="text-lg sm:text-xl font-display font-semibold text-foreground leading-relaxed italic" data-testid="text-quote">
                        "{data.quoteEpisode.quote}"
                      </p>
                      <div className="mt-4 flex items-center gap-3">
                        {data.quoteEpisode.artworkUrl && (
                          <img
                            src={data.quoteEpisode.artworkUrl.replace(/\/\d+x\d+bb\./, "/100x100bb.")}
                            alt={data.quoteEpisode.podcastName}
                            className="w-8 h-8 rounded-lg object-cover"
                          />
                        )}
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {data.quoteEpisode.quoteAttribution || data.quoteEpisode.hosts}
                          </p>
                          <p className="text-sm text-[#3F3F46] dark:text-[#A1A1AA]">
                            {data.quoteEpisode.podcastName} — {data.quoteEpisode.episodeTitle}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.section>
              )}

              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="pt-4"
                data-testid="section-drop-footer"
              >
                <div className="border-t border-border pt-8 text-center space-y-4">
                  <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] font-medium">
                    That's today's drop. See you tomorrow morning.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Link
                      href="/podcasts"
                      className="inline-flex items-center gap-2 text-[15px] font-semibold text-primary hover:text-primary/80 transition-colors"
                      data-testid="link-all-episodes"
                    >
                      <Headphones className="w-4 h-4" />
                      Browse all podcasts
                    </Link>
                  </div>
                </div>
              </motion.section>

            </div>
          ) : null}
        </div>
      </main>

      <Footer />
    </div>
  );
}
