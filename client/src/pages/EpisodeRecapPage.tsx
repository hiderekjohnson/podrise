import { useParams, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Lightbulb, Quote } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getPodcastBySlug } from "../data/podcastLandingData";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";
import { EpisodePageLayout } from "@/components/EpisodePageLayout";

export default function EpisodeRecapPage() {
  const params = useParams<{ podcastSlug: string; episodeSlug: string }>();
  const podcastSlug = params.podcastSlug || "";
  const episodeSlug = params.episodeSlug || "";

  const { data: episode, isLoading: episodeLoading } = useQuery<any>({
    queryKey: ["/api/podcasts", podcastSlug, "recaps", episodeSlug],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/recaps/${episodeSlug}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!podcastSlug && !!episodeSlug,
  });

  const { data: allRecaps = [] } = useQuery<any[]>({
    queryKey: ["/api/podcasts", podcastSlug, "recaps"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/recaps?limit=50`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!podcastSlug,
  });

  const podcastConfig = getPodcastBySlug(podcastSlug);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [podcastSlug, episodeSlug]);

  useEffect(() => {
    if (!episode) {
      document.title = "Episode Not Found | PodCap";
      return;
    }

    const pageTitle = `${episode.episodeTitle} — ${episode.podcastName} Recap | PodCap`;
    const pageDescription = episode.tldl.slice(0, 155) + (episode.tldl.length > 155 ? "..." : "");
    const canonicalUrl = `https://podcap.io/podcasts/${podcastSlug}/${episodeSlug}`;

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
    setMeta('meta[property="og:image"]', "content", episode.artworkUrl);
    setMeta('meta[property="og:url"]', "content", canonicalUrl);
    setMeta('meta[property="og:type"]', "content", "article");
    setMeta('meta[name="twitter:title"]', "content", pageTitle);
    setMeta('meta[name="twitter:description"]', "content", pageDescription);
    setMeta('meta[name="twitter:image"]', "content", episode.artworkUrl);

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
  }, [episode, podcastSlug, episodeSlug]);

  if (episodeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!episode || !podcastConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-display font-bold text-foreground mb-3" data-testid="text-not-found">Episode not found</h1>
          <p className="text-muted-foreground mb-6">This episode recap doesn't exist yet.</p>
          <Link href={podcastConfig ? `/podcasts/${podcastSlug}` : "/podcasts"}>
            <span className="text-primary font-semibold hover:underline" data-testid="link-back">
              {podcastConfig ? `Back to ${podcastConfig.name}` : "Browse all podcasts"}
            </span>
          </Link>
        </div>
      </div>
    );
  }

  const whatHappenedParagraphs = episode.whatHappened.split("\n\n").filter(Boolean);

  return (
    <EpisodePageLayout
      episode={episode}
      podcastSlug={podcastSlug}
      episodeSlug={episodeSlug}
      podcastConfig={podcastConfig}
      activeTab="recap"
      allRecaps={allRecaps}
      tabSearchOnKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const q = (e.target as HTMLInputElement).value.trim();
          if (q) {
            window.location.href = `/podcasts/${podcastSlug}/${episodeSlug}/transcript?q=${encodeURIComponent(q)}`;
          } else {
            window.location.href = `/podcasts/${podcastSlug}/${episodeSlug}/transcript`;
          }
        }
      }}
    >
      <motion.article
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="relative bg-gradient-to-br from-primary/[0.05] to-primary/[0.02] border border-primary/[0.1] rounded-2xl px-6 py-5 sm:px-7 sm:py-6 mb-12" data-testid="section-tldl">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/[0.1]">
              <Clock className="w-3.5 h-3.5 text-primary" />
            </span>
            <span className="text-xs font-bold text-primary uppercase tracking-wider">TLDL — Too Long, Didn't Listen</span>
          </div>
          <p className="text-[17px] leading-[1.85] text-foreground font-medium">{episode.tldl}</p>
        </div>

        {whatHappenedParagraphs.length > 0 && (
          <section className="mb-12" data-testid="section-what-happened">
            <h2 className="text-xl sm:text-[22px] font-display font-bold text-foreground mb-5 flex items-center gap-2.5">
              <span className="w-1 h-6 rounded-full bg-primary" />
              What Happened
            </h2>
            <div className="space-y-5">
              {whatHappenedParagraphs.map((paragraph, i) => (
                <p key={i} className="text-[17px] leading-[1.85] text-muted-foreground">
                  {i === 0 && <span className="text-foreground font-semibold">{paragraph.split(" ").slice(0, 3).join(" ")} </span>}
                  {i === 0 ? paragraph.split(" ").slice(3).join(" ") : paragraph}
                </p>
              ))}
            </div>
          </section>
        )}

        {episode.keyInsights.length > 0 && (
          <section className="mb-12" data-testid="section-key-insights">
            <h2 className="text-xl sm:text-[22px] font-display font-bold text-foreground mb-5 flex items-center gap-2.5">
              <span className="w-1 h-6 rounded-full bg-amber-400" />
              Key Insights
            </h2>
            <div className="grid gap-3">
              {episode.keyInsights.map((insight, i) => (
                <div
                  key={i}
                  className="flex gap-4 items-start bg-white dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.08] rounded-xl px-5 py-4 shadow-sm shadow-black/[0.02]"
                  data-testid={`insight-${i}`}
                >
                  <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                    <Lightbulb className="w-4 h-4" />
                  </span>
                  <p className="text-[16px] leading-[1.7] text-muted-foreground">{insight}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {episode.quote && (
          <section className="mb-12" data-testid="section-quote">
            <div className="relative bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl px-6 py-6 sm:px-8 sm:py-7 overflow-hidden">
              <div className="absolute top-4 right-5 opacity-[0.04]">
                <Quote className="w-24 h-24 text-foreground" />
              </div>
              <div className="relative">
                <Quote className="w-5 h-5 text-primary/40 mb-3" />
                <blockquote className="text-[18px] sm:text-[20px] leading-[1.7] text-foreground font-medium italic">
                  "{episode.quote}"
                </blockquote>
                {episode.quoteAttribution && (
                  <p className="mt-4 text-sm font-semibold text-muted-foreground">
                    — {episode.quoteAttribution}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}
        <p className="text-sm text-muted-foreground mb-12" data-testid="section-transcript-link">
          Prefer the source material?{" "}
          <Link
            href={`/podcasts/${podcastSlug}/${episodeSlug}/transcript`}
            className="text-primary font-medium hover:underline"
            data-testid="link-full-transcript"
          >
            Read the full transcript
          </Link>
        </p>
      </motion.article>
    </EpisodePageLayout>
  );
}
