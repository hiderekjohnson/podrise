import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Newspaper, ChevronLeft, ChevronRight } from "lucide-react";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";

interface DailyDropData {
  date: string;
  headline: string;
  subheadline: string;
  body: string;
  episodeSlugs: string[];
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
        return `<a href="${sanitizeText(normalizedHref)}" target="_blank" rel="noopener noreferrer" class="text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-colors font-medium">${text}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block w-3 h-3 ml-0.5 mb-0.5 opacity-40"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
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
      ? `${data.headline} - The Daily Drop - PodCap`
      : "The Daily Drop - PodCap";
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

      <SiteHeader />

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
