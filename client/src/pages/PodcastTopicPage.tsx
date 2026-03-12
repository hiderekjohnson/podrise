import { useMemo, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import { Headphones, ArrowRight, ChevronRight, Globe, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { LinkedHosts } from "@/components/LinkedHosts";
import {
  getCategoryBySlug,
  getPodcastsForTopic,
  getTopicsPageSlug,
  ALL_CATEGORY_SLUGS,
} from "@/data/podcastCategoryData";

function SEOHead({ topicName, categoryName, categorySlug, topicSlug, podcastNames }: {
  topicName: string;
  categoryName: string;
  categorySlug: string;
  topicSlug: string;
  podcastNames: string[];
}) {
  const title = `Best ${topicName} Podcasts (2026) | PodCap`;
  const top3 = podcastNames.slice(0, 3).join(", ");
  const description = `Discover the best ${topicName.toLowerCase()} podcasts in 2026, including ${top3}. Free AI-powered recaps delivered to your inbox.`;
  const canonicalUrl = `https://podcap.io/podcasts/${categorySlug}/${topicSlug}`;

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = title;
    const setOrCreate = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        if (selector.includes("property=")) {
          el.setAttribute("property", selector.match(/property="([^"]+)"/)?.[1] || "");
        } else {
          el.setAttribute("name", selector.match(/name="([^"]+)"/)?.[1] || "");
        }
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };
    setOrCreate('meta[name="description"]', "content", description);
    setOrCreate('meta[property="og:title"]', "content", title);
    setOrCreate('meta[property="og:description"]', "content", description);
    setOrCreate('meta[property="og:type"]', "content", "website");
    setOrCreate('meta[property="og:url"]', "content", canonicalUrl);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", canonicalUrl);

    return () => {
      document.title = "PodCap";
    };
  }, [title, description, canonicalUrl]);

  return null;
}

function JsonLdSchema({ topicName, categorySlug, topicSlug, podcasts }: {
  topicName: string;
  categorySlug: string;
  topicSlug: string;
  podcasts: { name: string; slug: string; artworkUrl: string }[];
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Best ${topicName} Podcasts`,
    description: `Top ${topicName.toLowerCase()} podcasts curated by PodCap`,
    url: `https://podcap.io/podcasts/${categorySlug}/${topicSlug}`,
    numberOfItems: podcasts.length,
    itemListElement: podcasts.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "PodcastSeries",
        name: p.name,
        url: `https://podcap.io/podcasts/${p.slug}`,
        image: p.artworkUrl,
      },
    })),
  };

  useEffect(() => {
    if (typeof document === "undefined") return;
    let script = document.querySelector('script[data-schema="topic-list"]') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute("data-schema", "topic-list");
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(schema);
    return () => {
      script?.remove();
    };
  }, [JSON.stringify(schema)]);

  return null;
}

export default function PodcastTopicPage() {
  const params = useParams<{ podcastSlug: string; episodeSlug: string }>();
  const [, navigate] = useLocation();

  const categorySlug = params.podcastSlug || "";
  const topicSlug = params.episodeSlug || "";

  const category = useMemo(() => getCategoryBySlug(categorySlug), [categorySlug]);

  const topic = useMemo(() => {
    if (!category) return undefined;
    return category.topics.find(t => t.slug === topicSlug);
  }, [category, topicSlug]);

  const podcasts = useMemo(() => {
    if (!category || !topic) return [];
    return getPodcastsForTopic(categorySlug, topicSlug);
  }, [categorySlug, topicSlug, category, topic]);

  const topicsPageSlug = useMemo(() => getTopicsPageSlug(topicSlug), [topicSlug]);

  useEffect(() => {
    if (!ALL_CATEGORY_SLUGS.includes(categorySlug) || !category) {
      navigate("/podcasts", { replace: true });
      return;
    }
    if (!topic) {
      navigate(`/podcasts/${categorySlug}`, { replace: true });
      return;
    }
    if (podcasts.length < 6) {
      navigate(`/podcasts/${categorySlug}`, { replace: true });
    }
  }, [categorySlug, category, topic, podcasts.length, navigate]);

  if (!category || !topic || podcasts.length < 6) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead
        topicName={topic.name}
        categoryName={category.name}
        categorySlug={categorySlug}
        topicSlug={topicSlug}
        podcastNames={podcasts.map(p => p.name)}
      />
      <JsonLdSchema
        topicName={topic.name}
        categorySlug={categorySlug}
        topicSlug={topicSlug}
        podcasts={podcasts.map(p => ({ name: p.name, slug: p.slug, artworkUrl: p.artworkUrl }))}
      />

      <SiteHeader />

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20">
        <section className="w-full max-w-5xl pt-6 pb-8">
          <nav className="flex items-center gap-1.5 text-[15px] text-muted-foreground mb-6 flex-wrap" data-testid="breadcrumbs">
            <a href="/podcasts" className="hover:text-foreground transition-colors" data-testid="breadcrumb-podcasts">
              Podcasts
            </a>
            <ChevronRight className="w-3.5 h-3.5" />
            <a
              href={`/podcasts/${categorySlug}`}
              className="hover:text-foreground transition-colors"
              data-testid="breadcrumb-category"
            >
              {category.name}
            </a>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground font-medium" data-testid="breadcrumb-topic">
              {topic.name}
            </span>
          </nav>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col gap-3"
          >
            <h1
              className="text-3xl sm:text-4xl md:text-5xl font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em]"
              data-testid="heading-topic"
            >
              Best {topic.name} Podcasts
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl leading-relaxed" data-testid="text-topic-description">
              {topic.description}
            </p>
          </motion.div>
        </section>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full max-w-5xl"
        >
          <div className="bg-white dark:bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 sm:px-8 py-4 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-primary" />
                <span className="text-base font-display font-bold text-foreground">
                  {topic.name} Podcasts
                </span>
              </div>
              <span className="text-base text-[#3F3F46] dark:text-[#A1A1AA] font-medium">
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 divide-y sm:divide-y-0 divide-black/[0.04] dark:divide-white/[0.04]">
              {podcasts.map((podcast, index) => (
                <a
                  key={podcast.slug}
                  href={`/podcasts/${podcast.slug}`}
                  className="flex items-center gap-4 px-6 sm:px-7 py-5 transition-colors hover:bg-black/[0.015] dark:hover:bg-white/[0.015] group/row border-b border-black/[0.04] dark:border-white/[0.04] sm:border-r sm:last:border-r-0"
                  data-testid={`topic-podcast-row-${index}`}
                >
                  {podcast.artworkUrl ? (
                    <img
                      src={podcast.artworkUrl}
                      alt={podcast.name}
                      className="w-14 h-14 rounded-xl object-cover shrink-0 shadow-md shadow-black/[0.06]"
                      data-testid={`topic-artwork-${index}`}
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

          {topicsPageSlug && (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-12"
            >
              <div className="bg-white dark:bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-6 sm:p-8 shadow-sm">
                <h2 className="text-xl font-display font-bold text-foreground mb-2" data-testid="heading-go-deeper">
                  Want to go deeper?
                </h2>
                <p className="text-base text-muted-foreground mb-4 leading-relaxed">
                  Explore recent episodes, key people, and trending insights about {topic.name.toLowerCase()} from across the podcast ecosystem.
                </p>
                <a
                  href={`/topics/${topicsPageSlug}`}
                  className="inline-flex items-center gap-2 text-primary font-semibold text-[15px] hover:underline"
                  data-testid="link-topics-page"
                >
                  Explore {topic.name} on PodCap
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </motion.section>
          )}

          <div className="mt-8 text-center">
            <Link
              href={`/podcasts/${categorySlug}`}
              className="inline-flex items-center gap-2 text-[15px] text-muted-foreground hover:text-foreground font-medium transition-colors"
              data-testid="link-back-to-category"
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              Back to all {category.name} podcasts
            </Link>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
