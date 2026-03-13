import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronRight as ChevronRightSmall, Activity, Calendar, Tag } from "lucide-react";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { StickyEmailBar } from "@/components/StickyEmailBar";
import { InlineEmailCTA } from "@/components/InlineEmailCTA";
import { TOPICS, getCategoryPath } from "@/data/topicData";

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

function formatDateISO(dateStr: string) {
  return dateStr;
}

function sanitizeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function normalizeLink(href: string): string {
  const cleaned = href.trim();
  if (cleaned.startsWith("javascript:") || cleaned.startsWith("data:") || cleaned.startsWith("vbscript:")) {
    return "#";
  }
  if (cleaned.startsWith("/podcasts/") || cleaned.startsWith("/people/") || cleaned.startsWith("/companies/") || cleaned.startsWith("/topics/") || cleaned.startsWith("/bookstore/") || cleaned.startsWith("/insights/") || cleaned.startsWith("/industries/") || cleaned.startsWith("/interests/") || cleaned.startsWith("/roles/")) {
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

function applyInlineFormatting(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, linkText, href) => {
      const normalizedHref = normalizeLink(href);
      const internal = isInternalLink(normalizedHref);
      if (internal) {
        return `<a href="${sanitizeText(normalizedHref)}" class="text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-colors font-medium">${linkText}</a>`;
      }
      return `<a href="${sanitizeText(normalizedHref)}" target="_blank" rel="noopener noreferrer" class="text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-colors font-medium">${linkText}</a>`;
    });
}

function renderMarkdownBody(body: string) {
  const paragraphs = body.split(/\n\n+/);

  return paragraphs.map((p, i) => {
    const isBlockquote = p.split('\n').every(line => line.trimStart().startsWith('> ') || line.trim() === '');
    if (isBlockquote) {
      const quoteContent = p.split('\n')
        .map(line => line.trimStart().replace(/^>\s?/, ''))
        .join(' ')
        .trim();
      const rendered = applyInlineFormatting(sanitizeText(quoteContent));
      return (
        <blockquote
          key={i}
          className="border-l-4 border-primary/40 pl-5 py-3 my-6 text-[18px] sm:text-[20px] leading-[1.7] text-[#27272A] dark:text-[#D4D4D8] italic font-medium"
          dangerouslySetInnerHTML={{ __html: rendered }}
          data-testid={`body-blockquote-${i}`}
        />
      );
    }

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

      const renderedBullets = bullets.map(b => applyInlineFormatting(b));

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

    rendered = applyInlineFormatting(rendered);

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

function Breadcrumbs({ topicSlug, topicName, date, basePath }: { topicSlug: string; topicName: string; date?: string; basePath: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-[14px] text-[#52525B] dark:text-[#A1A1AA] mb-5" aria-label="Breadcrumb" data-testid="nav-breadcrumbs">
      <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
      <ChevronRightSmall className="w-3 h-3 shrink-0" />
      <Link href={basePath} className="hover:text-foreground transition-colors">{basePath === "/industries" ? "Industries" : basePath === "/roles" ? "Roles" : "Topics"}</Link>
      <ChevronRightSmall className="w-3 h-3 shrink-0" />
      <Link href={`${basePath}/${topicSlug}`} className="hover:text-foreground transition-colors">{topicName}</Link>
      <ChevronRightSmall className="w-3 h-3 shrink-0" />
      {date ? (
        <>
          <Link href={`${basePath}/${topicSlug}/pulse`} className="hover:text-foreground transition-colors">The Pulse</Link>
          <ChevronRightSmall className="w-3 h-3 shrink-0" />
          <span className="text-foreground font-medium">{formatDateShort(date)}</span>
        </>
      ) : (
        <span className="text-foreground font-medium">The Pulse</span>
      )}
    </nav>
  );
}

function AsHeardOn({ sourceEpisodes }: { sourceEpisodes: TopicPulse["sourceEpisodes"] }) {
  const [expanded, setExpanded] = useState(false);
  const uniquePodcasts = [...new Map(sourceEpisodes.map(ep => [ep.podcastSlug, ep])).values()];
  if (uniquePodcasts.length === 0) return null;
  const MAX_VISIBLE = 5;
  const hasOverflow = uniquePodcasts.length > MAX_VISIBLE;
  const visiblePodcasts = expanded ? uniquePodcasts : uniquePodcasts.slice(0, MAX_VISIBLE);
  const remainingCount = uniquePodcasts.length - MAX_VISIBLE;

  return (
    <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed" data-testid="text-as-heard-on">
      <span className="font-medium text-[#3F3F46] dark:text-[#A1A1AA]">As heard on: </span>
      {visiblePodcasts.map((ep, i) => (
        <span key={ep.podcastSlug}>
          <Link
            href={`/podcasts/${ep.podcastSlug}`}
            className="text-primary hover:text-primary/80 transition-colors"
            data-testid={`link-podcast-source-${i}`}
          >
            {ep.podcastName}
          </Link>
          {i < visiblePodcasts.length - 1 && <span>, </span>}
        </span>
      ))}
      {hasOverflow && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-primary hover:text-primary/80 transition-colors font-medium ml-1"
          data-testid="button-show-more-podcasts"
        >
          + {remainingCount} more
        </button>
      )}
    </p>
  );
}

function PulseEdition({ topicSlug, date, basePath }: { topicSlug: string; date: string; basePath: string }) {
  const topic = TOPICS.find(t => t.slug === topicSlug);
  const topicName = topic?.name || topicSlug;
  const categoryType: "industry" | "interest" | "role" = basePath === "/industries" ? "industry" : basePath === "/roles" ? "role" : "interest";

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
    const canonicalUrl = `https://podcap.io/topics/${topicSlug}/pulse/${date}`;
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
      setOrCreate('meta[property="og:url"]', "property", canonicalUrl);
      setOrCreate('meta[property="og:type"]', "property", "article");

      let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = canonicalUrl;

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
            "@id": canonicalUrl,
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
            <Link href={`${basePath}/${topicSlug}/pulse`} className="text-[16px] font-semibold text-primary hover:text-primary/80 transition-colors">
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
              <Breadcrumbs topicSlug={topicSlug} topicName={topicName} date={date} basePath={basePath} />

              <div className="flex items-center gap-2 text-[15px] font-semibold uppercase tracking-wider text-primary mb-4">
                <Activity className="w-3.5 h-3.5" />
                The Pulse
                <span className="text-muted-foreground/40 mx-1">·</span>
                <span className="font-medium normal-case tracking-normal text-[#3F3F46] dark:text-[#A1A1AA]">
                  {topicName}
                </span>
                <span className="text-muted-foreground/40 mx-1">·</span>
                <time
                  dateTime={formatDateISO(pulse.publishDate)}
                  className="flex items-center gap-1.5 text-[#3F3F46] dark:text-[#A1A1AA] font-medium normal-case tracking-normal"
                >
                  <Calendar className="w-3 h-3" />
                  {formatDateLong(pulse.publishDate)}
                </time>
              </div>

              <h1 className="text-[1.75rem] sm:text-[2.25rem] font-display font-extrabold text-foreground leading-[1.15] tracking-[-0.02em] mb-3" data-testid="heading-pulse">
                {pulse.headline}
              </h1>

              {pulse.summary && (
                <p className="text-lg sm:text-xl text-[#52525B] dark:text-[#A1A1AA] leading-relaxed font-medium mb-4" data-testid="text-pulse-summary">
                  {pulse.summary}
                </p>
              )}

              <AsHeardOn sourceEpisodes={pulse.sourceEpisodes} />

              <InlineEmailCTA
                type={categoryType}
                slug={topicSlug}
                name={topicName}
                variant="gradient"
                className="mt-6"
              />
            </motion.header>

            <div className="w-full h-px bg-border mb-8 sm:mb-10" />

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="space-y-5 sm:space-y-6"
              data-testid="section-pulse-body"
            >
              {(() => {
                const elements = renderMarkdownBody(pulse.body);
                const midpoint = Math.floor(elements.length / 2);
                const before = elements.slice(0, midpoint);
                const after = elements.slice(midpoint);
                return (
                  <>
                    {before}
                    <InlineEmailCTA
                      type={categoryType}
                      slug={topicSlug}
                      name={topicName}
                      variant="card"
                    />
                    {after}
                  </>
                );
              })()}
            </motion.div>

            {pulse.keyThemes && pulse.keyThemes.length > 0 && (
              <div className="mt-8 flex flex-wrap items-center gap-2" data-testid="section-key-themes">
                <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                {pulse.keyThemes.map((theme, i) => {
                  const themeSlug = theme.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                  return (
                    <Link
                      key={theme}
                      href={`${basePath}/${topicSlug}?tag=${encodeURIComponent(themeSlug)}`}
                      className="inline-flex items-center px-3 py-1 rounded-full bg-primary/[0.06] border border-primary/10 text-[13px] text-primary/80 font-medium hover:bg-primary/[0.12] hover:border-primary/20 transition-colors"
                      data-testid={`link-theme-tag-${i}`}
                    >
                      {theme}
                    </Link>
                  );
                })}
              </div>
            )}

            <InlineEmailCTA
              type={categoryType}
              slug={topicSlug}
              name={topicName}
              variant="gradient"
              className="mt-10"
            />

            <div className="w-full h-px bg-border mt-10 mb-8" />

            <nav className="flex items-center justify-between" data-testid="nav-pulse-editions">
              {prevPulse ? (
                <Link
                  href={`${basePath}/${topicSlug}/pulse/${prevPulse.publishDate}`}
                  className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-primary hover:text-primary/80 transition-colors"
                  data-testid="link-prev-pulse"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {formatDateShort(prevPulse.publishDate)}
                </Link>
              ) : <div />}
              {nextPulse ? (
                <Link
                  href={`${basePath}/${topicSlug}/pulse/${nextPulse.publishDate}`}
                  className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-primary hover:text-primary/80 transition-colors"
                  data-testid="link-next-pulse"
                >
                  {formatDateShort(nextPulse.publishDate)}
                  <ChevronRight className="w-4 h-4" />
                </Link>
              ) : <div />}
            </nav>

            {allPulses && allPulses.length > 1 && (
              <div className="mt-10 pt-8 border-t border-border" data-testid="section-past-briefings">
                <h3 className="text-[17px] font-display font-bold text-foreground mb-4">Past Briefings</h3>
                <div className="space-y-1">
                  {allPulses.filter(p => p.publishDate !== date).map((p, i) => (
                    <Link
                      key={p.publishDate}
                      href={`${basePath}/${topicSlug}/pulse/${p.publishDate}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors group"
                      data-testid={`link-past-briefing-${i}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                          {p.headline}
                        </p>
                      </div>
                      <time
                        dateTime={formatDateISO(p.publishDate)}
                        className="text-[14px] text-muted-foreground ml-3 shrink-0 flex items-center gap-1"
                      >
                        <Calendar className="w-3 h-3" />
                        {formatDateShort(p.publishDate)}
                      </time>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </article>
    </>
  );
}

function PulseArchive({ topicSlug, basePath }: { topicSlug: string; basePath: string }) {
  const topic = TOPICS.find(t => t.slug === topicSlug);
  const topicName = topic?.name || topicSlug;

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
    const description = `Stay informed about ${topicName} with daily intelligence briefings synthesized from podcast conversations.`;
    const canonicalUrl = `https://podcap.io/topics/${topicSlug}/pulse`;
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

      let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = canonicalUrl;
    }
    return null;
  }

  if (latestPulse && !isLoading) {
    return <PulseEdition topicSlug={topicSlug} date={latestPulse.publishDate} basePath={basePath} />;
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
            <Link href={`${basePath}/${topicSlug}`} className="text-[16px] font-semibold text-primary hover:text-primary/80 transition-colors">
              Explore {topicName} topic
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

export default function TopicPulsePage() {
  const [matchTopicsArchive, topicsArchiveParams] = useRoute("/topics/:slug/pulse");
  const [matchTopicsDate, topicsDateParams] = useRoute("/topics/:slug/pulse/:date");
  const [matchInsightsArchive, insightsArchiveParams] = useRoute("/insights/:slug/pulse");
  const [matchInsightsDate, insightsDateParams] = useRoute("/insights/:slug/pulse/:date");
  const [matchIndustriesArchive, industriesArchiveParams] = useRoute("/industries/:slug/pulse");
  const [matchIndustriesDate, industriesDateParams] = useRoute("/industries/:slug/pulse/:date");
  const [matchInterestsArchive, interestsArchiveParams] = useRoute("/interests/:slug/pulse");
  const [matchInterestsDate, interestsDateParams] = useRoute("/interests/:slug/pulse/:date");
  const [matchRolesArchive, rolesArchiveParams] = useRoute("/roles/:slug/pulse");
  const [matchRolesDate, rolesDateParams] = useRoute("/roles/:slug/pulse/:date");

  const dateParams = topicsDateParams || insightsDateParams || industriesDateParams || interestsDateParams || rolesDateParams;
  const archiveParams = topicsArchiveParams || insightsArchiveParams || industriesArchiveParams || interestsArchiveParams || rolesArchiveParams;
  const matchDate = matchTopicsDate || matchInsightsDate || matchIndustriesDate || matchInterestsDate || matchRolesDate;

  const topicSlug = dateParams?.slug || archiveParams?.slug || "";
  const date = dateParams?.date;

  const topic = TOPICS.find(t => t.slug === topicSlug);
  let basePath = "/interests";
  if (matchIndustriesArchive || matchIndustriesDate) basePath = "/industries";
  else if (matchInterestsArchive || matchInterestsDate) basePath = "/interests";
  else if (matchRolesArchive || matchRolesDate) basePath = "/roles";
  else if (topic) basePath = getCategoryPath(topic.category);

  const categoryType: "industry" | "interest" | "role" = basePath === "/industries" ? "industry" : basePath === "/roles" ? "role" : "interest";
  const topicName = topic?.name || topicSlug;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        {matchDate && date ? (
          <PulseEdition topicSlug={topicSlug} date={date} basePath={basePath} />
        ) : (
          <PulseArchive topicSlug={topicSlug} basePath={basePath} />
        )}
      </main>
      <Footer />
      <StickyEmailBar
        type={categoryType}
        slug={topicSlug}
        name={topicName}
        scrollThreshold={400}
      />
    </div>
  );
}
