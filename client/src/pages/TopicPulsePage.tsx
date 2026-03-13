import { useQuery } from "@tanstack/react-query";
import { Link, useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, Activity, Clock, Podcast } from "lucide-react";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { TOPICS } from "@/data/topicData";

interface TopicPulse {
  id: number;
  topicSlug: string;
  publishDate: string;
  headline: string;
  summary: string;
  body: string;
  keyThemes: string[] | null;
  episodeCount: number;
  sourceEpisodes: { podcastSlug: string; episodeSlug: string; podcastName: string; episodeTitle: string }[];
  generatedAt: string;
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

function sanitizeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function normalizeLink(href: string): string {
  const cleaned = href.trim();
  if (cleaned.startsWith("javascript:") || cleaned.startsWith("data:") || cleaned.startsWith("vbscript:")) {
    return "#";
  }
  if (cleaned.startsWith("/podcasts/") || cleaned.startsWith("/people/") || cleaned.startsWith("/companies/") || cleaned.startsWith("/topics/") || cleaned.startsWith("/daily-drop") || cleaned.startsWith("/bookstore/")) {
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

function isInternalLink(href: string): boolean {
  return href.startsWith("/");
}

function renderMarkdownBody(body: string) {
  const paragraphs = body.split(/\n\n+/);

  return paragraphs.map((p, i) => {
    let rendered = sanitizeText(p);

    const isBulletBlock = rendered.split('\n').some(line => line.trimStart().startsWith('- ') || line.trimStart().startsWith('* '));
    if (isBulletBlock) {
      const lines = rendered.split('\n');
      const bullets: string[] = [];
      let currentBullet = '';

      for (const line of lines) {
        const trimmed = line.trimStart();
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          if (currentBullet) bullets.push(currentBullet);
          currentBullet = trimmed.slice(2);
        } else if (currentBullet) {
          currentBullet += ' ' + trimmed;
        } else {
          if (trimmed) bullets.push(trimmed);
        }
      }
      if (currentBullet) bullets.push(currentBullet);

      const renderedBullets = bullets.map(b => {
        let html = b;
        html = html
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, href) => {
            const normalizedHref = normalizeLink(href);
            const isInternal = isInternalLink(normalizedHref);
            if (isInternal) {
              return `<a href="${sanitizeText(normalizedHref)}" class="text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-colors font-medium">${text}</a>`;
            }
            return `<a href="${sanitizeText(normalizedHref)}" target="_blank" rel="noopener noreferrer" class="text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-colors font-medium">${text}</a>`;
          });
        return html;
      });

      return (
        <ul key={i} className="space-y-2 pl-5 list-disc" data-testid={`body-list-${i}`}>
          {renderedBullets.map((b, j) => (
            <li
              key={j}
              className="text-[16px] sm:text-[17px] leading-[1.75] text-[#27272A] dark:text-[#D4D4D8]"
              dangerouslySetInnerHTML={{ __html: b }}
            />
          ))}
        </ul>
      );
    }

    rendered = rendered
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, href) => {
        const normalizedHref = normalizeLink(href);
        const isInternal = isInternalLink(normalizedHref);
        if (isInternal) {
          return `<a href="${sanitizeText(normalizedHref)}" class="text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-colors font-medium">${text}</a>`;
        }
        return `<a href="${sanitizeText(normalizedHref)}" target="_blank" rel="noopener noreferrer" class="text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-colors font-medium">${text}</a>`;
      });

    const isHeader = rendered.startsWith('<strong>') && rendered.endsWith('</strong>') && !rendered.includes('<strong>', 8);
    if (isHeader) {
      return (
        <h2
          key={i}
          className="text-[20px] sm:text-[22px] font-display font-bold text-foreground mt-8 mb-3"
          dangerouslySetInnerHTML={{ __html: rendered }}
          data-testid={`body-heading-${i}`}
        />
      );
    }

    return (
      <p
        key={i}
        className="text-[16px] sm:text-[17px] leading-[1.8] text-[#27272A] dark:text-[#D4D4D8]"
        dangerouslySetInnerHTML={{ __html: rendered }}
        data-testid={`body-paragraph-${i}`}
      />
    );
  });
}

function PulseEdition({ topicSlug, date }: { topicSlug: string; date: string }) {
  const topic = TOPICS.find(t => t.slug === topicSlug);
  const topicName = topic?.name || topicSlug;

  const { data: pulse, isLoading, isError } = useQuery<TopicPulse>({
    queryKey: ["/api/topics", topicSlug, "pulse", date],
    queryFn: async () => {
      const res = await fetch(`/api/topics/${topicSlug}/pulse/${date}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const { data: allPulses } = useQuery<TopicPulse[]>({
    queryKey: ["/api/topics", topicSlug, "pulse"],
    queryFn: async () => {
      const res = await fetch(`/api/topics/${topicSlug}/pulse`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const currentIndex = allPulses?.findIndex(p => p.publishDate === date) ?? -1;
  const prevPulse = currentIndex >= 0 && currentIndex < (allPulses?.length || 0) - 1 ? allPulses![currentIndex + 1] : null;
  const nextPulse = currentIndex > 0 ? allPulses![currentIndex - 1] : null;

  function SEOHead() {
    const title = pulse
      ? `${pulse.headline} - ${topicName} Pulse - PodCap`
      : `${topicName} Pulse - PodCap`;
    const description = pulse?.summary || `Daily ${topicName} intelligence briefing from podcast conversations. Stay informed about what matters.`;
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
      setOrCreate('meta[property="og:type"]', "property", "article");

      let scriptEl = document.querySelector('script[type="application/ld+json"][data-pulse]') as HTMLScriptElement | null;
      if (pulse) {
        const jsonLd = {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: pulse.headline,
          description: pulse.summary,
          datePublished: pulse.publishDate,
          publisher: {
            "@type": "Organization",
            name: "PodCap",
            url: "https://podcap.io",
          },
          mainEntityOfPage: {
            "@type": "WebPage",
            "@id": `https://podcap.io/topics/${topicSlug}/pulse/${date}`,
          },
          about: {
            "@type": "Thing",
            name: topicName,
          },
        };
        if (!scriptEl) {
          scriptEl = document.createElement("script");
          scriptEl.type = "application/ld+json";
          scriptEl.setAttribute("data-pulse", "true");
          document.head.appendChild(scriptEl);
        }
        scriptEl.textContent = JSON.stringify(jsonLd);
      }
    }
    return null;
  }

  return (
    <>
      <SEOHead />
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
        ) : isError || !pulse ? (
          <div className="text-center py-16" data-testid="pulse-error">
            <Activity className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-lg font-display font-bold text-foreground mb-1">Briefing not found</p>
            <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mb-4">No Pulse briefing available for this date.</p>
            <Link href={`/topics/${topicSlug}/pulse`} className="text-[16px] font-semibold text-primary hover:text-primary/80 transition-colors">
              Browse all briefings
            </Link>
          </div>
        ) : (
          <>
            <motion.header
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-8 sm:mb-10"
            >
              <Link
                href={`/topics/${topicSlug}/pulse`}
                className="inline-flex items-center gap-1.5 text-[16px] font-medium text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors mb-5"
                data-testid="link-back-pulse"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                All {topicName} Briefings
              </Link>

              <div className="flex items-center gap-2 text-[15px] font-semibold uppercase tracking-wider text-primary mb-4">
                <Activity className="w-3.5 h-3.5" />
                The Pulse
                <span className="text-muted-foreground/40 mx-1">·</span>
                <span className="font-medium normal-case tracking-normal text-[#3F3F46] dark:text-[#A1A1AA]">
                  {topicName}
                </span>
                <span className="text-muted-foreground/40 mx-1">·</span>
                <span className="flex items-center gap-1.5 text-[#3F3F46] dark:text-[#A1A1AA] font-medium normal-case tracking-normal">
                  <Calendar className="w-3 h-3" />
                  {formatDateLong(pulse.publishDate)}
                </span>
              </div>

              <h1 className="text-[1.75rem] sm:text-[2.25rem] font-display font-extrabold text-foreground leading-[1.15] tracking-[-0.02em] mb-3" data-testid="heading-pulse">
                {pulse.headline}
              </h1>

              {pulse.summary && (
                <p className="text-lg sm:text-xl text-[#52525B] dark:text-[#A1A1AA] leading-relaxed font-medium" data-testid="text-pulse-summary">
                  {pulse.summary}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 mt-4">
                <span className="inline-flex items-center gap-1.5 text-[14px] text-[#52525B] dark:text-[#A1A1AA]">
                  <Podcast className="w-3.5 h-3.5" />
                  {pulse.episodeCount} episode{pulse.episodeCount !== 1 ? "s" : ""} analyzed
                </span>
                {pulse.keyThemes && pulse.keyThemes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {pulse.keyThemes.map((theme, i) => (
                      <span key={i} className="px-2.5 py-0.5 text-[13px] font-medium rounded-full bg-primary/10 text-primary" data-testid={`badge-theme-${i}`}>
                        {theme}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.header>

            <div className="w-full h-px bg-border mb-8 sm:mb-10" />

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="space-y-5 sm:space-y-6"
              data-testid="section-pulse-body"
            >
              {renderMarkdownBody(pulse.body)}
            </motion.div>

            {pulse.sourceEpisodes && pulse.sourceEpisodes.length > 0 && (
              <div className="mt-10 pt-8 border-t border-border" data-testid="section-source-episodes">
                <h3 className="text-[17px] font-display font-bold text-foreground mb-4">Episodes Analyzed</h3>
                <div className="space-y-2">
                  {pulse.sourceEpisodes.map((ep, i) => (
                    <Link
                      key={i}
                      href={`/podcasts/${ep.podcastSlug}/${ep.episodeSlug}`}
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
                      data-testid={`link-source-episode-${i}`}
                    >
                      <Podcast className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[15px] font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                          {ep.episodeTitle}
                        </p>
                        <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA]">
                          {ep.podcastName}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="w-full h-px bg-border mt-10 mb-8" />

            <nav className="flex items-center justify-between" data-testid="nav-pulse-editions">
              {prevPulse ? (
                <Link
                  href={`/topics/${topicSlug}/pulse/${prevPulse.publishDate}`}
                  className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-primary hover:text-primary/80 transition-colors"
                  data-testid="link-prev-pulse"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {formatDateShort(prevPulse.publishDate)}
                </Link>
              ) : <div />}
              {nextPulse ? (
                <Link
                  href={`/topics/${topicSlug}/pulse/${nextPulse.publishDate}`}
                  className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-primary hover:text-primary/80 transition-colors"
                  data-testid="link-next-pulse"
                >
                  {formatDateShort(nextPulse.publishDate)}
                  <ChevronRight className="w-4 h-4" />
                </Link>
              ) : <div />}
            </nav>
          </>
        )}
      </article>
    </>
  );
}

function PulseArchive({ topicSlug }: { topicSlug: string }) {
  const topic = TOPICS.find(t => t.slug === topicSlug);
  const topicName = topic?.name || topicSlug;
  const [, navigate] = useLocation();

  const { data: pulses, isLoading } = useQuery<TopicPulse[]>({
    queryKey: ["/api/topics", topicSlug, "pulse"],
    queryFn: async () => {
      const res = await fetch(`/api/topics/${topicSlug}/pulse`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const latestPulse = pulses && pulses.length > 0 ? pulses[0] : null;

  function SEOHead() {
    const title = `${topicName} Pulse - Daily Intelligence Briefing - PodCap`;
    const description = `Stay informed about ${topicName} with daily intelligence briefings synthesized from podcast conversations. Key insights, expert quotes, and actionable knowledge delivered every morning.`;
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

  if (latestPulse && !isLoading) {
    return <PulseEdition topicSlug={topicSlug} date={latestPulse.publishDate} />;
  }

  return (
    <>
      <SEOHead />
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-16 sm:pb-20">
        {isLoading ? (
          <div className="space-y-6 animate-pulse">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-10 bg-muted rounded w-3/4" />
            <div className="h-6 bg-muted rounded w-1/2" />
            <div className="h-px bg-border my-8" />
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-muted rounded" />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <Activity className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-lg font-display font-bold text-foreground mb-1">No briefings yet</p>
            <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mb-4">The {topicName} Pulse will be published soon.</p>
            <Link href={`/topics/${topicSlug}`} className="text-[16px] font-semibold text-primary hover:text-primary/80 transition-colors">
              Explore {topicName} topic
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

export default function TopicPulsePage() {
  const [matchArchive, archiveParams] = useRoute("/topics/:slug/pulse");
  const [matchDate, dateParams] = useRoute("/topics/:slug/pulse/:date");

  const topicSlug = dateParams?.slug || archiveParams?.slug || "";
  const date = dateParams?.date;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        {matchDate && date ? (
          <PulseEdition topicSlug={topicSlug} date={date} />
        ) : (
          <PulseArchive topicSlug={topicSlug} />
        )}
      </main>
      <Footer />
    </div>
  );
}
