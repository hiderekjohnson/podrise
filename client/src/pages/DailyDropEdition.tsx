import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Calendar, Newspaper, ChevronLeft, ChevronRight } from "lucide-react";
import { Footer } from "@/components/Footer";
import { PodCapWordmark } from "@/components/PodCapHeader";

interface EpisodeRef {
  slug: string;
  episodeSlug: string;
  podcastName: string;
  episodeTitle: string;
  tldl: string;
  artworkUrl: string | null;
  duration: string | null;
  hosts: string | null;
}

interface DailyDropData {
  date: string;
  headline: string;
  subheadline: string;
  body: string;
  episodeSlugs: string[];
  episodeCount: number;
  episodes: EpisodeRef[];
  prevDate: string | null;
  nextDate: string | null;
}

function formatDateLong(dateStr: string) {
  const parts = dateStr.split("-");
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
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
  if (parts.length === 2) return `${parseInt(parts[0])}min`;
  return dur;
}

function sanitizeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function normalizeLink(href: string): string {
  const cleaned = href.trim();
  if (cleaned.startsWith("javascript:") || cleaned.startsWith("data:") || cleaned.startsWith("vbscript:")) {
    return "#";
  }
  if (cleaned.startsWith("/podcasts/") || cleaned.startsWith("/people/") || cleaned.startsWith("/companies/") || cleaned.startsWith("/topics/") || cleaned.startsWith("/daily-drop")) {
    return cleaned;
  }
  const match = cleaned.match(/(?:https?:\/\/[^/]*)?(\/?podcasts\/[^\s)]+)/);
  if (match) {
    const path = match[1].startsWith("/") ? match[1] : "/" + match[1];
    return path;
  }
  if (cleaned.startsWith("https://") || cleaned.startsWith("http://")) {
    return cleaned;
  }
  return "#";
}

function renderMarkdownBody(body: string) {
  const paragraphs = body.split(/\n\n+/);

  return paragraphs.map((p, i) => {
    let rendered = sanitizeText(p);

    rendered = rendered
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, href) => {
        const normalizedHref = normalizeLink(href);
        return `<a href="${sanitizeText(normalizedHref)}" class="text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-colors font-medium">${text}</a>`;
      });

    return (
      <p
        key={i}
        className="text-[17px] sm:text-lg leading-[1.8] text-[#27272A] dark:text-[#D4D4D8]"
        dangerouslySetInnerHTML={{ __html: rendered }}
        data-testid={`body-paragraph-${i}`}
      />
    );
  });
}

export default function DailyDropEdition() {
  const [, params] = useRoute("/daily-drop/:date");
  const dateParam = params?.date || "latest";

  const { data, isLoading, isError } = useQuery<DailyDropData>({
    queryKey: ["/api/daily-drop", dateParam],
  });

  function SEOHead() {
    const title = data
      ? `${data.headline} — The Daily Drop — PodCap`
      : "The Daily Drop — PodCap";
    const description = data?.subheadline || "Your daily podcast briefing from PodCap.";
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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead />

      <header className="w-full px-6 min-h-[68px] flex items-center justify-between max-w-6xl mx-auto">
        <Link href="/" className="flex items-center" data-testid="link-home">
          <PodCapWordmark />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/daily-drop"
            className="text-[15px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors min-h-[44px] px-3 flex items-center"
            data-testid="link-all-editions"
          >
            All Editions
          </Link>
          <Link
            href="/podcasts"
            className="text-[15px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors min-h-[44px] px-3 hidden sm:flex items-center"
            data-testid="link-browse-nav"
          >
            Browse
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <article className="w-full max-w-2xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-16 sm:pb-20">

          {isLoading ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/4" />
              <div className="h-10 bg-muted rounded w-3/4" />
              <div className="h-6 bg-muted rounded w-2/3" />
              <div className="h-px bg-border my-8" />
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-5 bg-muted rounded w-full" />
                ))}
              </div>
            </div>
          ) : isError ? (
            <div className="text-center py-16" data-testid="edition-error">
              <Newspaper className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-lg font-display font-bold text-foreground mb-1">Edition not found</p>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mb-4">We couldn't find a Daily Drop for this date.</p>
              <Link href="/daily-drop" className="text-[15px] font-semibold text-primary hover:text-primary/80 transition-colors">
                Browse all editions →
              </Link>
            </div>
          ) : data ? (
            <>
              <motion.header
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-8 sm:mb-10"
              >
                <Link
                  href="/daily-drop"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors mb-5"
                  data-testid="link-back-editions"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  All Editions
                </Link>

                <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-primary mb-4">
                  <Newspaper className="w-3.5 h-3.5" />
                  The Daily Drop
                  <span className="text-muted-foreground/40 mx-1">·</span>
                  <span className="flex items-center gap-1.5 text-[#3F3F46] dark:text-[#A1A1AA] font-medium normal-case tracking-normal">
                    <Calendar className="w-3 h-3" />
                    {formatDateLong(data.date)}
                  </span>
                </div>

                <h1 className="text-[1.75rem] sm:text-[2.25rem] font-display font-extrabold text-foreground leading-[1.15] tracking-[-0.02em] mb-3" data-testid="heading-edition">
                  {data.headline}
                </h1>

                {data.subheadline && (
                  <p className="text-lg sm:text-xl text-[#52525B] dark:text-[#A1A1AA] leading-relaxed font-medium" data-testid="text-subheadline">
                    {data.subheadline}
                  </p>
                )}
              </motion.header>

              <div className="w-full h-px bg-border mb-8 sm:mb-10" />

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="space-y-5 sm:space-y-6"
                data-testid="section-body"
              >
                {renderMarkdownBody(data.body)}
              </motion.div>

              <div className="w-full h-px bg-border mt-10 mb-8" />

              {data.episodes.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="mb-10"
                  data-testid="section-all-episodes"
                >
                  <h2 className="text-xs font-bold uppercase tracking-widest text-[#3F3F46] dark:text-[#A1A1AA] mb-4">
                    All {data.episodeCount} recaps from {formatDateLong(data.date).split(",")[0]}
                  </h2>
                  <div className="bg-card border border-border rounded-2xl divide-y divide-border">
                    {data.episodes.map((ep, i) => (
                      <Link
                        key={`${ep.slug}-${ep.episodeSlug}`}
                        href={`/podcasts/${ep.slug}/${ep.episodeSlug}`}
                        className="flex items-center gap-3.5 px-4 sm:px-5 py-3.5 group hover:bg-muted/30 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                        data-testid={`link-episode-${i}`}
                      >
                        {ep.artworkUrl && (
                          <img
                            src={ep.artworkUrl.replace(/\/\d+x\d+bb\./, "/100x100bb.")}
                            alt={ep.podcastName}
                            className="w-9 h-9 rounded-lg object-cover shadow-sm shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-primary/60 truncate">{ep.podcastName}</p>
                          <p className="text-[14px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">{ep.episodeTitle}</p>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
                      </Link>
                    ))}
                  </div>
                </motion.section>
              )}

              <nav className="flex items-center justify-between" data-testid="nav-editions">
                {data.prevDate ? (
                  <Link
                    href={`/daily-drop/${data.prevDate}`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                    data-testid="link-prev-edition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Link>
                ) : <div />}
                {data.nextDate ? (
                  <Link
                    href={`/daily-drop/${data.nextDate}`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                    data-testid="link-next-edition"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                ) : <div />}
              </nav>
            </>
          ) : null}

        </article>
      </main>

      <Footer />
    </div>
  );
}
