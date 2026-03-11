import { useMemo, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { Headphones, ChevronRight, ArrowRight, Zap, Globe } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { LinkedHosts } from "@/components/LinkedHosts";
import {
  getCategoryBySlug,
  getPodcastsForCategory,
  getPodcastsForTopic,
  getQualifyingTopics,
  getTopicsPageSlug,
  TOPIC_TO_TOPICS_PAGE_MAP,
  type PodcastCategory,
  type CategoryTopic,
} from "@/data/podcastCategoryData";
import type { PodcastLandingConfig } from "@/data/podcastLandingData";

function SEOHead({ category, podcasts }: { category: PodcastCategory; podcasts: PodcastLandingConfig[] }) {
  const title = `Best ${category.name} Podcasts (2026) | PodCap`;
  const top3 = podcasts.slice(0, 3).map(p => p.name).join(", ");
  const desc = `Discover the best ${category.name.toLowerCase()} podcasts including ${top3}. AI-powered recaps and summaries delivered daily.`;
  const canonical = `https://podcap.io/podcasts/${category.slug}`;

  useEffect(() => {
    document.title = title;
    const setOrCreate = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        const [k, v] = attr === "name"
          ? ["name", selector.match(/name="([^"]+)"/)?.[1] || ""]
          : ["property", selector.match(/property="([^"]+)"/)?.[1] || ""];
        el.setAttribute(k, v);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    };
    setOrCreate('meta[name="description"]', "name", desc);
    setOrCreate('meta[property="og:title"]', "property", title);
    setOrCreate('meta[property="og:description"]', "property", desc);
    setOrCreate('meta[property="og:type"]', "property", "website");
    setOrCreate('meta[property="og:url"]', "property", canonical);

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", canonical);

    let jsonLd = document.querySelector('script[data-category-jsonld]') as HTMLScriptElement;
    if (!jsonLd) {
      jsonLd = document.createElement("script");
      jsonLd.setAttribute("type", "application/ld+json");
      jsonLd.setAttribute("data-category-jsonld", "true");
      document.head.appendChild(jsonLd);
    }
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `Best ${category.name} Podcasts`,
      description: desc,
      url: canonical,
      numberOfItems: podcasts.length,
      itemListElement: podcasts.slice(0, 50).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: p.name,
        url: `https://podcap.io/podcasts/${p.slug}`,
      })),
    });

    return () => {
      jsonLd?.remove();
    };
  }, [title, desc, canonical, category.name, podcasts]);

  return null;
}

export default function PodcastCategoryPage() {
  const params = useParams<{ slug: string }>();
  const [, navigate] = useLocation();

  const categorySlug = params.slug || "";
  const category = useMemo(() => getCategoryBySlug(categorySlug), [categorySlug]);
  const podcasts = useMemo(() => getPodcastsForCategory(categorySlug), [categorySlug]);
  const qualifyingTopics = useMemo(() => getQualifyingTopics(categorySlug), [categorySlug]);

  const goDeeper = useMemo(() => {
    if (!category) return [];
    const links: { topicName: string; topicSlug: string; topicsPageSlug: string }[] = [];
    for (const topic of category.topics) {
      const pageSlug = getTopicsPageSlug(topic.slug);
      if (pageSlug) {
        links.push({ topicName: topic.name, topicSlug: topic.slug, topicsPageSlug: pageSlug });
      }
    }
    return links;
  }, [category]);

  useEffect(() => {
    if (!category || podcasts.length === 0) {
      navigate("/podcasts", { replace: true });
    }
  }, [category, podcasts.length, navigate]);

  if (!category || podcasts.length === 0) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteHeader />

      <SEOHead category={category} podcasts={podcasts} />

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20">
        <div className="w-full max-w-4xl">
          <nav className="flex items-center gap-1.5 text-base text-muted-foreground mb-6 pt-6 flex-wrap" data-testid="breadcrumbs">
            <Link href="/podcasts" className="hover:text-foreground transition-colors" data-testid="breadcrumb-podcasts">
              Podcasts
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground font-medium" data-testid="breadcrumb-category">
              {category.name}
            </span>
          </nav>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <h1
              className="text-3xl sm:text-4xl md:text-5xl font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em] mb-3"
              data-testid="heading-category"
            >
              Best {category.name} Podcasts
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl leading-relaxed mb-2">
              {category.description}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <div className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 sm:px-8 py-4 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center gap-3">
                <Globe className="w-5 h-5 text-primary" />
                <span className="text-base font-display font-bold text-foreground">
                  {category.name} Podcasts
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 divide-y sm:divide-y-0 divide-black/[0.04] dark:divide-white/[0.04]">
                {podcasts.map((podcast, index) => (
                  <a
                    key={podcast.slug}
                    href={`/podcasts/${podcast.slug}`}
                    className="flex items-center gap-4 px-6 sm:px-7 py-5 transition-colors hover:bg-black/[0.015] dark:hover:bg-white/[0.02] group/row border-b border-black/[0.04] dark:border-white/[0.04] sm:border-r sm:last:border-r-0"
                    data-testid={`category-podcast-row-${index}`}
                  >
                    {podcast.artworkUrl ? (
                      <img
                        src={podcast.artworkUrl}
                        alt={podcast.name}
                        className="w-14 h-14 rounded-xl object-cover shrink-0 shadow-md shadow-black/[0.06]"
                        data-testid={`category-artwork-${index}`}
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-primary/[0.08] flex items-center justify-center shrink-0">
                        <Headphones className="w-6 h-6 text-primary/60" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-bold text-foreground truncate group-hover/row:text-primary transition-colors">
                        {podcast.name}
                      </p>
                      <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-0.5 truncate">
                        <LinkedHosts hosts={podcast.hosts || ""} />
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </motion.div>

          {qualifyingTopics.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="mt-16"
              data-testid="section-explore-topics"
            >
              <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground mb-6">
                Explore {category.name} by Topic
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {qualifyingTopics.map(topic => {
                  return (
                    <Link
                      key={topic.slug}
                      href={`/podcasts/${categorySlug}/${topic.slug}`}
                      className="group/card p-5 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-white/[0.03] hover-elevate transition-all"
                      data-testid={`topic-card-${topic.slug}`}
                    >
                      <h3 className="text-base font-bold text-foreground group-hover/card:text-primary transition-colors mb-1.5">
                        {topic.name}
                      </h3>
                      <p className="text-[15px] text-muted-foreground leading-relaxed mb-3">
                        {topic.description}
                      </p>
                      <div className="flex items-center gap-1.5 text-[15px] font-medium text-primary">
                        <span>Explore</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </motion.section>
          )}

          {goDeeper.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              className="mt-16"
              data-testid="section-go-deeper"
            >
              <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground mb-4">
                Go Deeper
              </h2>
              <p className="text-base text-muted-foreground mb-6 max-w-2xl">
                Explore curated topic pages with the latest episodes, key people, and trending insights.
              </p>
              <div className="flex flex-wrap gap-3">
                {goDeeper.map(link => (
                  <Link
                    key={link.topicSlug}
                    href={`/topics/${link.topicsPageSlug}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-white/[0.03] text-[15px] font-medium text-foreground hover-elevate transition-all"
                    data-testid={`go-deeper-${link.topicSlug}`}
                  >
                    {link.topicName}
                    <ArrowRight className="w-3.5 h-3.5 text-primary" />
                  </Link>
                ))}
              </div>
            </motion.section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
