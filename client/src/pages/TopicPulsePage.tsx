import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { motion } from "framer-motion";
import { ChevronRight as ChevronRightSmall, Activity, Calendar } from "lucide-react";
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
  if (cleaned.startsWith("/podcasts/") || cleaned.startsWith("/people/") || cleaned.startsWith("/companies/") || cleaned.startsWith("/topics/") || cleaned.startsWith("/shop/") || cleaned.startsWith("/insights/") || cleaned.startsWith("/industries/") || cleaned.startsWith("/interests/") || cleaned.startsWith("/roles/")) {
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

function getCategoryLabel(basePath: string): string {
  if (basePath === "/industries") return "Industries";
  if (basePath === "/roles") return "Roles";
  return "Interests";
}

function Breadcrumbs({ topicSlug, topicName, basePath, date }: { topicSlug: string; topicName: string; basePath: string; date?: string }) {
  const categoryLabel = getCategoryLabel(basePath);
  return (
    <nav className="flex flex-wrap items-center gap-1 text-[14px] text-[#52525B] dark:text-[#A1A1AA] mb-5" aria-label="Breadcrumb" data-testid="nav-breadcrumbs">
      <Link href={basePath} className="hover:text-foreground transition-colors">{categoryLabel}</Link>
      <ChevronRightSmall className="w-3 h-3 shrink-0" />
      <Link href={`${basePath}/${topicSlug}`} className="hover:text-foreground transition-colors">{topicName}</Link>
      <ChevronRightSmall className="w-3 h-3 shrink-0" />
      {date ? (
        <>
          <Link href={`${basePath}/${topicSlug}/pulse`} className="hover:text-foreground transition-colors">The Pulse</Link>
          <ChevronRightSmall className="w-3 h-3 shrink-0" />
          <span className="text-foreground font-medium">{formatDateLong(date)}</span>
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
      <span className="font-medium text-[#52525B] dark:text-[#A1A1AA]">As heard on: </span>
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

  const pastBriefings = allPulses?.filter(p => p.publishDate !== date).slice(0, 5) || [];

  function SEOHead() {
    const formattedDate = formatDateLong(date);
    const title = pulse
      ? `${pulse.headline} | The Pulse — ${topicName}`
      : `${topicName} Pulse — ${formattedDate} | PodRise`;
    const description = pulse?.summary
      ? `${pulse.summary.slice(0, 155).trim()}${pulse.summary.length > 155 ? '…' : ''}`
      : `What ${topicName.toLowerCase()} podcasts are talking about today — key developments, expert takes, and trends synthesized from top shows.`;
    const canonicalUrl = `https://podrise.com${basePath}/${topicSlug}/pulse/${date}`;
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
      setOrCreate('meta[property="og:site_name"]', "property", "PodRise");
      setOrCreate('meta[name="twitter:card"]', "name", "summary_large_image");
      setOrCreate('meta[name="twitter:title"]', "name", title);
      setOrCreate('meta[name="twitter:description"]', "name", description);
      setOrCreate('meta[name="robots"]', "name", "index, follow, max-snippet:-1");
      setOrCreate('meta[property="article:published_time"]', "property", date);
      setOrCreate('meta[property="article:section"]', "property", topicName);
      setOrCreate('meta[property="article:tag"]', "property", topicName);

      let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = canonicalUrl;

      let scriptEl = document.querySelector('script[type="application/ld+json"][data-pulse]') as HTMLScriptElement | null;
      if (pulse) {
        const sourceNames = pulse.sourceEpisodes
          ? [...new Set(pulse.sourceEpisodes.map(ep => ep.podcastName))].slice(0, 5)
          : [];
        const jsonLd = {
          "@context": "https://schema.org",
          "@type": "NewsArticle",
          headline: pulse.headline,
          description: pulse.summary,
          datePublished: `${pulse.publishDate}T06:00:00Z`,
          dateModified: `${pulse.publishDate}T06:00:00Z`,
          author: {
            "@type": "Organization",
            name: "The Pulse by PodRise",
            url: "https://podrise.com",
          },
          publisher: {
            "@type": "Organization",
            name: "PodRise",
            url: "https://podrise.com",
          },
          mainEntityOfPage: {
            "@type": "WebPage",
            "@id": canonicalUrl,
          },
          articleSection: topicName,
          keywords: pulse.keyThemes ? pulse.keyThemes.join(", ") : topicName,
          about: {
            "@type": "Thing",
            name: topicName,
          },
          ...(sourceNames.length > 0 && {
            citation: sourceNames.map(name => ({
              "@type": "CreativeWork",
              name: name,
            })),
          }),
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
      <div className="bg-[#F4F4F5] dark:bg-[#0A0A0F]">
        <article className="w-full max-w-[680px] mx-auto px-5 sm:px-6 pt-8 sm:pt-14 pb-16 sm:pb-20">
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
              <p className="text-base text-[#52525B] dark:text-[#A1A1AA] mb-4">No Pulse briefing available for this date.</p>
              <Link href={`${basePath}/${topicSlug}/pulse`} className="text-[16px] font-semibold text-primary hover:text-primary/80 transition-colors">
                Browse all briefings
              </Link>
            </div>
          ) : (
            <>
              <Breadcrumbs topicSlug={topicSlug} topicName={topicName} basePath={basePath} date={date} />

              <div className="bg-white dark:bg-[#18181B] rounded-2xl shadow-sm border border-black/[0.04] dark:border-white/[0.06] overflow-hidden mb-8 sm:mb-10">
                <motion.header
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="px-6 sm:px-10 pt-8 sm:pt-10 pb-6 sm:pb-8 border-b border-black/[0.04] dark:border-white/[0.06]"
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] flex items-center justify-center shadow-sm" data-testid="icon-pulse-brand">
                      <Activity className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[13px] font-bold uppercase tracking-wider text-primary/70">The Pulse</span>
                  </div>

                  <div className="flex items-center gap-1 text-[13px] text-[#71717A] dark:text-[#A1A1AA] mb-5" data-testid="nav-pulse-context">
                    <Link href={basePath} className="hover:text-foreground transition-colors">{getCategoryLabel(basePath)}</Link>
                    <ChevronRightSmall className="w-3 h-3 shrink-0" />
                    <Link href={`${basePath}/${topicSlug}`} className="hover:text-foreground transition-colors">{topicName}</Link>
                    <ChevronRightSmall className="w-3 h-3 shrink-0" />
                    <span className="text-foreground/70 font-medium">The Pulse</span>
                  </div>

                  <h1 className="text-[1.75rem] sm:text-[2.25rem] font-display font-extrabold text-foreground leading-[1.15] tracking-[-0.02em] mb-3" data-testid="heading-pulse">
                    {pulse.headline}
                  </h1>

                  <AsHeardOn sourceEpisodes={pulse.sourceEpisodes} />
                </motion.header>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="px-6 sm:px-10 py-8 sm:py-10 space-y-5 sm:space-y-6"
                  data-testid="section-pulse-body"
                >
                  {renderMarkdownBody(pulse.body)}
                </motion.div>

                <div className="px-6 sm:px-10 pb-8 sm:pb-10">
                  <InlineEmailCTA
                    type={categoryType}
                    slug={topicSlug}
                    name={topicName}
                    variant="gradient"
                  />
                </div>
              </div>

              {pastBriefings.length > 0 && (
                <div className="mt-12 pt-10 border-t border-border/60" data-testid="section-past-briefings">
                  <h3 className="text-[18px] sm:text-[20px] font-display font-bold text-foreground mb-5">
                    Previously in the Pulse on {topicName}
                  </h3>
                  <div className="space-y-3">
                    {pastBriefings.map((p, i) => (
                      <Link
                        key={p.publishDate}
                        href={`${basePath}/${topicSlug}/pulse/${p.publishDate}`}
                        className="group block p-4 rounded-xl border border-black/[0.05] dark:border-white/[0.08] hover:border-primary/20 hover:bg-primary/[0.02] transition-all"
                        data-testid={`link-past-briefing-${i}`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <time dateTime={p.publishDate} className="text-[13px] text-[#71717A] dark:text-[#A1A1AA] flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" />
                            {formatDateLong(p.publishDate)}
                          </time>
                        </div>
                        <p className="text-[15px] sm:text-[16px] font-semibold text-foreground group-hover:text-primary transition-colors leading-snug mb-1">
                          {p.headline}
                        </p>
                        {p.summary && (
                          <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA] leading-relaxed line-clamp-2">
                            {p.summary}
                          </p>
                        )}
                      </Link>
                    ))}
                  </div>
                  {allPulses && allPulses.length > 6 && (
                    <div className="mt-4 text-center">
                      <Link
                        href={`${basePath}/${topicSlug}/pulse`}
                        className="text-[14px] font-semibold text-primary hover:text-primary/80 transition-colors"
                        data-testid="link-view-all-briefings"
                      >
                        View all {topicName} pulses →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </article>
      </div>
    </>
  );
}

function PulseArchive({ topicSlug, basePath }: { topicSlug: string; basePath: string }) {
  const topic = TOPICS.find(t => t.slug === topicSlug);
  const topicName = topic?.name || topicSlug;
  const categoryType: "industry" | "interest" | "role" = basePath === "/industries" ? "industry" : basePath === "/roles" ? "role" : "interest";
  const categoryLabel = getCategoryLabel(basePath);

  const { data: pulses, isLoading } = useQuery<TopicPulse[]>({
    queryKey: ["/api/topics", topicSlug, "pulse"],
    queryFn: async () => {
      const res = await fetch(`/api/topics/${topicSlug}/pulse`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  function SEOHead() {
    const latestPulse = pulses && pulses.length > 0 ? pulses[0] : null;
    const title = `The Pulse on ${topicName} — Daily Podcast Intelligence | PodRise`;
    const description = latestPulse
      ? `Today: ${latestPulse.headline}. Get the daily ${topicName.toLowerCase()} briefing — what top podcasts are saying, synthesized into key takeaways.`
      : `What ${topicName.toLowerCase()} podcasts are talking about — daily briefings with key developments, expert takes, and trends from top shows.`;
    const canonicalUrl = `https://podrise.com${basePath}/${topicSlug}/pulse`;
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
      setOrCreate('meta[name="description"]', "name", description.slice(0, 160));
      setOrCreate('meta[property="og:title"]', "property", title);
      setOrCreate('meta[property="og:description"]', "property", description.slice(0, 160));
      setOrCreate('meta[property="og:url"]', "property", canonicalUrl);
      setOrCreate('meta[property="og:site_name"]', "property", "PodRise");
      setOrCreate('meta[name="twitter:card"]', "name", "summary_large_image");
      setOrCreate('meta[name="twitter:title"]', "name", title);
      setOrCreate('meta[name="twitter:description"]', "name", description.slice(0, 160));
      setOrCreate('meta[name="robots"]', "name", "index, follow, max-snippet:-1");

      let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = canonicalUrl;

      let scriptEl = document.querySelector('script[type="application/ld+json"][data-pulse-archive]') as HTMLScriptElement | null;
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `The Pulse on ${topicName}`,
        description: description,
        url: canonicalUrl,
        publisher: {
          "@type": "Organization",
          name: "PodRise",
          url: "https://podrise.com",
        },
        about: {
          "@type": "Thing",
          name: topicName,
        },
        ...(pulses && pulses.length > 0 && {
          hasPart: pulses.slice(0, 10).map(p => ({
            "@type": "NewsArticle",
            headline: p.headline,
            datePublished: `${p.publishDate}T06:00:00Z`,
            url: `https://podrise.com${basePath}/${topicSlug}/pulse/${p.publishDate}`,
          })),
        }),
      };
      if (!scriptEl) {
        scriptEl = document.createElement("script");
        scriptEl.type = "application/ld+json";
        scriptEl.setAttribute("data-pulse-archive", "true");
        document.head.appendChild(scriptEl);
      }
      scriptEl.textContent = JSON.stringify(jsonLd);
    }
    return null;
  }

  const groupedByMonth: Record<string, TopicPulse[]> = {};
  if (pulses) {
    for (const p of pulses) {
      const parts = p.publishDate.split("-");
      const monthKey = `${parts[0]}-${parts[1]}`;
      if (!groupedByMonth[monthKey]) groupedByMonth[monthKey] = [];
      groupedByMonth[monthKey].push(p);
    }
  }

  function formatMonthLabel(monthKey: string) {
    const [year, month] = monthKey.split("-");
    const d = new Date(parseInt(year), parseInt(month) - 1, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  return (
    <>
      <SEOHead />
      <div className="bg-[#F4F4F5] dark:bg-[#0A0A0F] min-h-full">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-16 sm:pb-20">
        <Breadcrumbs topicSlug={topicSlug} topicName={topicName} basePath={basePath} />

        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 text-primary mb-3">
            <Activity className="w-4 h-4" />
            <span className="text-[12px] font-bold uppercase tracking-wider">The Pulse</span>
          </div>
          <h1 className="text-[28px] sm:text-[36px] font-display font-bold text-foreground leading-tight" data-testid="heading-pulse-archive">
            {topicName} Briefings
          </h1>
        </motion.header>

        <div className="w-full h-px bg-border mb-8" />

        {isLoading ? (
          <div className="space-y-6 animate-pulse">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-3 bg-muted rounded w-24" />
                <div className="h-6 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-full" />
              </div>
            ))}
          </div>
        ) : pulses && pulses.length > 0 ? (
          <div className="bg-white dark:bg-[#18181B] rounded-2xl shadow-sm border border-black/[0.04] dark:border-white/[0.06] p-5 sm:p-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="space-y-10"
            data-testid="section-pulse-archive"
          >
            {Object.entries(groupedByMonth).map(([monthKey, monthPulses]) => (
              <div key={monthKey}>
                <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground mb-4" data-testid={`heading-month-${monthKey}`}>
                  {formatMonthLabel(monthKey)}
                </h2>
                <div className="space-y-3">
                  {monthPulses.map((p) => (
                    <Link
                      key={p.publishDate}
                      href={`${basePath}/${topicSlug}/pulse/${p.publishDate}`}
                      className="group block p-4 sm:p-5 rounded-xl border border-black/[0.06] dark:border-white/[0.08] hover:border-primary/20 hover:bg-primary/[0.02] transition-all"
                      data-testid={`link-pulse-${p.publishDate}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <time dateTime={p.publishDate} className="text-[13px] text-muted-foreground flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" />
                          {formatDateLong(p.publishDate)}
                        </time>
                      </div>
                      <h3 className="text-[16px] sm:text-[17px] font-semibold text-foreground group-hover:text-primary transition-colors leading-snug mb-1.5">
                        {p.headline}
                      </h3>
                      {p.summary && (
                        <p className="text-[14px] sm:text-[15px] text-[#52525B] dark:text-[#A1A1AA] leading-relaxed line-clamp-2">
                          {p.summary}
                        </p>
                      )}
                      {p.keyThemes && p.keyThemes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {p.keyThemes.slice(0, 4).map((theme, ti) => (
                            <span key={ti} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/[0.06] text-primary/80">
                              {theme}
                            </span>
                          ))}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
          </div>
        ) : (
          <div className="text-center py-16">
            <Activity className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-lg font-display font-bold text-foreground mb-1">No briefings yet</p>
            <p className="text-base text-[#52525B] dark:text-[#A1A1AA] mb-4">The {topicName} Pulse will be published soon.</p>
            <Link href={`${basePath}/${topicSlug}`} className="text-[16px] font-semibold text-primary hover:text-primary/80 transition-colors" data-testid="link-explore-topic">
              Explore {topicName} topic
            </Link>
          </div>
        )}
      </div>
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
