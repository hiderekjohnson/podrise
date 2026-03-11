import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Newspaper, Calendar } from "lucide-react";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";

interface Edition {
  date: string;
  headline: string;
  subheadline: string;
  episodeCount: number;
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
  const title = "Signal | PodCap";
  const description = "A free-flowing daily briefing on the most interesting conversations happening across the podcast world. Smart, sharp, and built for discovery.";
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

      <SiteHeader />

      <main className="flex-1">
        <section className="w-full max-w-2xl mx-auto text-center px-4 sm:px-6 pt-12 sm:pt-16 pb-8 sm:pb-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center gap-3"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/[0.06] border border-primary/10 text-primary text-[13px] font-semibold uppercase tracking-wider" data-testid="badge-daily-drop">
              <Newspaper className="w-3.5 h-3.5" />
              Daily Briefing
            </div>
            <h1 className="text-[2.5rem] sm:text-[3.5rem] font-display font-extrabold text-foreground leading-[1.06] tracking-[-0.03em]" data-testid="heading-daily-drop">
              Signal
            </h1>
            <p className="text-lg text-[#3F3F46] dark:text-[#A1A1AA] max-w-lg leading-relaxed font-medium">
              What happened yesterday in the podcast world. The stories, the quotes, and the ideas worth knowing about.
            </p>
          </motion.div>
        </section>

        <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
          {isLoading ? (
            <div className="space-y-6 animate-pulse">
              <div className="bg-card border border-border rounded-2xl p-8">
                <div className="h-4 bg-muted rounded w-1/4 mb-4" />
                <div className="h-8 bg-muted rounded w-3/4 mb-3" />
                <div className="h-5 bg-muted rounded w-full" />
              </div>
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-card border border-border rounded-2xl p-6">
                  <div className="h-4 bg-muted rounded w-1/5 mb-3" />
                  <div className="h-6 bg-muted rounded w-2/3 mb-2" />
                  <div className="h-4 bg-muted rounded w-full" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="bg-card border border-border rounded-2xl p-8 text-center" data-testid="daily-drop-error">
              <Newspaper className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-lg font-display font-bold text-foreground mb-1">No editions yet</p>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">Check back soon for the first edition of Signal.</p>
            </div>
          ) : editions.length > 0 ? (
            <div className="space-y-4">

              {latest && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  <Link
                    href={`/daily-drop/${latest.date}`}
                    className="block group"
                    data-testid="link-latest-edition"
                  >
                    <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 hover-elevate transition-all">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="text-xs font-bold uppercase tracking-widest text-primary">Latest</span>
                        <span className="text-xs text-muted-foreground/50 ml-1">{formatDateLong(latest.date)}</span>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground leading-tight group-hover:text-primary transition-colors mb-2" data-testid="text-latest-headline">
                        {latest.headline}
                      </h2>
                      {latest.subheadline && (
                        <p className="text-base text-[#52525B] dark:text-[#A1A1AA] leading-relaxed mb-3">
                          {latest.subheadline}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 text-[15px] font-semibold text-primary">
                        <span>Read this edition</span>
                        <ArrowRight className="w-4 h-4" />
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
                  className="space-y-3 mt-6"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-foreground/30" />
                    <span className="text-xs font-bold uppercase tracking-widest text-[#3F3F46] dark:text-[#A1A1AA]">Past Editions</span>
                  </div>
                  {past.map((edition, i) => (
                    <Link
                      key={edition.date}
                      href={`/daily-drop/${edition.date}`}
                      className="block group"
                      data-testid={`link-edition-${i}`}
                    >
                      <div className="bg-card border border-border rounded-xl px-5 sm:px-6 py-4 hover:bg-muted/30 transition-all flex items-start gap-4">
                        <div className="w-11 h-11 rounded-lg bg-primary/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[13px] font-bold text-primary leading-tight text-center">{formatDateShort(edition.date)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[15px] font-bold text-foreground group-hover:text-primary transition-colors leading-snug mb-0.5">
                            {edition.headline}
                          </h3>
                          {edition.subheadline && (
                            <p className="text-[15px] text-[#52525B] dark:text-[#A1A1AA] line-clamp-1">{edition.subheadline}</p>
                          )}
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0 mt-1" />
                      </div>
                    </Link>
                  ))}
                </motion.div>
              )}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-8 text-center">
              <Newspaper className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-lg font-display font-bold text-foreground mb-1">No editions yet</p>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">The first edition of Signal is coming soon.</p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
