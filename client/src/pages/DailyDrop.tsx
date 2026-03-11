import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Headphones, Calendar, Newspaper } from "lucide-react";
import { Footer } from "@/components/Footer";
import { PodCapWordmark } from "@/components/PodCapHeader";
import type { LandingPageRecap } from "@shared/schema";

interface Edition {
  date: string;
  count: number;
  hero: LandingPageRecap | null;
}

function formatDateLong(dateStr: string) {
  const parts = dateStr.split("-");
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatDateShort(dateStr: string) {
  const parts = dateStr.split("-");
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
  const { data, isLoading, isError } = useQuery<{ editions: Edition[] }>({
    queryKey: ["/api/daily-drop/editions"],
  });

  const editions = data?.editions || [];
  const latest = editions[0];
  const past = editions.slice(1);

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
            <p className="text-lg text-[#3F3F46] dark:text-[#A1A1AA] max-w-xl leading-relaxed font-medium">
              Your daily podcast briefing. The best episodes, sharpest insights, and must-listen moments — curated every morning.
            </p>
          </motion.div>
        </section>

        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
          {isLoading ? (
            <div className="space-y-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-card border border-border rounded-2xl p-6 animate-pulse">
                  <div className="h-5 bg-muted rounded w-1/4 mb-4" />
                  <div className="h-7 bg-muted rounded w-2/3 mb-3" />
                  <div className="h-4 bg-muted rounded w-full mb-2" />
                  <div className="h-4 bg-muted rounded w-4/5" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="bg-card border border-border rounded-2xl p-8 text-center" data-testid="daily-drop-error">
              <Headphones className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-lg font-display font-bold text-foreground mb-1">Couldn't load editions</p>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">Something went wrong. Try refreshing the page.</p>
            </div>
          ) : editions.length > 0 ? (
            <div className="space-y-6">

              {latest && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-widest text-primary">Latest Edition</span>
                  </div>
                  <Link
                    href={`/daily-drop/${latest.date}`}
                    className="block group"
                    data-testid="link-latest-edition"
                  >
                    <div className="bg-card border border-border rounded-2xl overflow-hidden hover-elevate transition-all">
                      <div className="p-6 sm:p-8">
                        <div className="flex items-start gap-5">
                          {latest.hero?.artworkUrl && (
                            <img
                              src={latest.hero.artworkUrl.replace(/\/\d+x\d+bb\./, "/300x300bb.")}
                              alt={latest.hero.podcastName}
                              className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover shadow-md shadow-black/[0.06] shrink-0"
                              data-testid="img-latest-artwork"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Calendar className="w-3.5 h-3.5 text-[#3F3F46] dark:text-[#A1A1AA]" />
                              <span className="text-sm font-medium text-[#3F3F46] dark:text-[#A1A1AA]">{formatDateLong(latest.date)}</span>
                            </div>
                            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground leading-tight group-hover:text-primary transition-colors mb-2" data-testid="text-latest-title">
                              {latest.count} episode{latest.count !== 1 ? "s" : ""} dropped
                            </h2>
                            {latest.hero && (
                              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] leading-relaxed line-clamp-2">
                                Featuring: {latest.hero.podcastName} — {latest.hero.episodeTitle}
                              </p>
                            )}
                            <div className="flex items-center gap-1.5 text-[15px] font-semibold text-primary mt-3">
                              <span>Read this edition</span>
                              <ArrowRight className="w-4 h-4" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              )}

              {past.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  <div className="flex items-center gap-2 mb-3 mt-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-foreground/40" />
                    <span className="text-xs font-bold uppercase tracking-widest text-[#3F3F46] dark:text-[#A1A1AA]">Past Editions</span>
                  </div>
                  <div className="bg-card border border-border rounded-2xl divide-y divide-border">
                    {past.map((edition, i) => (
                      <Link
                        key={edition.date}
                        href={`/daily-drop/${edition.date}`}
                        className="flex items-center gap-4 px-5 sm:px-6 py-4 group hover:bg-muted/30 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                        data-testid={`link-edition-${i}`}
                      >
                        <div className="w-12 h-12 rounded-xl bg-primary/[0.06] flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-primary">{formatDateShort(edition.date)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors">
                            {formatDateLong(edition.date)}
                          </p>
                          <p className="text-sm text-[#3F3F46] dark:text-[#A1A1AA]">
                            {edition.count} episode{edition.count !== 1 ? "s" : ""}
                            {edition.hero ? ` · Featuring ${edition.hero.podcastName}` : ""}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                      </Link>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          ) : null}
        </div>
      </main>

      <Footer />
    </div>
  );
}
