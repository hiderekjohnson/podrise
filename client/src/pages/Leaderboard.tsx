import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { Headphones, Globe, Search, X, ArrowRight, Zap, Tag } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { PodCapWordmark } from "@/components/PodCapHeader";
import {
  PODCAST_CATEGORIES,
  getAllCategoryLinks,
  getQualifyingTopics,
  getPodcastsForTopic,
} from "@/data/podcastCategoryData";

const CATEGORY_MAP: Record<string, string[]> = {
  "Business": ["business", "entrepreneurship", "startup", "saas", "management", "strategy", "acquisitions", "growth", "marketing", "online marketing", "side hustles", "company analysis", "business of tech", "business news", "economic", "organizational"],
  "Technology": ["tech", "ai", "software", "engineering", "product management", "automotive", "consumer tech", "internet culture", "vc / ai", "venture capital / software"],
  "Finance": ["finance", "investing", "markets", "wealth", "personal finance", "financial independence", "consumer advice", "money"],
  "Science": ["science", "space", "fact-checking", "education", "society & culture"],
  "Health": ["health", "fitness", "medicine", "longevity", "functional medicine", "performance", "wellbeing", "mindfulness", "meditation"],
  "Self-Improvement": ["self-improvement", "personal development", "coaching", "lifestyle", "motivation", "mindset", "empowerment", "productivity", "philosophy"],
  "Politics & News": ["politics", "news", "law", "government"],
  "Entertainment": ["entertainment", "comedy", "film", "tv", "arts", "culture", "interviews", "human stories", "narrative", "sports"],
  "Psychology": ["psychology", "behavior", "mental health"],
};

const DISPLAY_TO_CATEGORY_SLUG: Record<string, string> = {
  "Business": "business",
  "Technology": "technology",
  "Finance": "finance",
  "Science": "science",
  "Health": "health",
  "Self-Improvement": "self-improvement",
  "Politics & News": "news",
  "Entertainment": "society-culture",
  "Psychology": "psychology",
};

function getCategoryGroup(rawCategory: string): string[] {
  const lower = rawCategory.toLowerCase();
  const groups: string[] = [];
  for (const [group, keywords] of Object.entries(CATEGORY_MAP)) {
    if (keywords.some(kw => lower.includes(kw))) {
      groups.push(group);
    }
  }
  return groups.length > 0 ? groups : ["Other"];
}

const ALL_GROUPS = [...Object.keys(CATEGORY_MAP), "Other"].sort();

export default function Leaderboard() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  const podcastsWithGroups = useMemo(() => {
    return PODCAST_LANDINGS.map(p => ({
      ...p,
      groups: getCategoryGroup(p.category),
    }));
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of podcastsWithGroups) {
      for (const g of p.groups) {
        counts[g] = (counts[g] || 0) + 1;
      }
    }
    return counts;
  }, [podcastsWithGroups]);

  const availableGroups = useMemo(() => {
    return ALL_GROUPS.filter(g => (categoryCounts[g] || 0) > 0);
  }, [categoryCounts]);

  const filtered = useMemo(() => {
    let results = podcastsWithGroups;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      results = results.filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term) ||
        (p.hosts && p.hosts.toLowerCase().includes(term))
      );
    }
    return results;
  }, [podcastsWithGroups, searchTerm]);

  const categoryLinks = useMemo(() => getAllCategoryLinks(), []);

  const exploreByTopic = useMemo(() => {
    return categoryLinks
      .map(cat => {
        const category = PODCAST_CATEGORIES.find(c => c.slug === cat.slug);
        if (!category) return null;
        const qualifyingTopics = getQualifyingTopics(cat.slug).slice(0, 3);
        if (qualifyingTopics.length === 0) return null;
        return {
          categorySlug: cat.slug,
          categoryName: cat.name,
          topics: qualifyingTopics.map(t => ({
            ...t,
            count: getPodcastsForTopic(cat.slug, t.slug).length,
          })),
        };
      })
      .filter(Boolean) as {
        categorySlug: string;
        categoryName: string;
        topics: { slug: string; name: string; description: string; count: number }[];
      }[];
  }, [categoryLinks]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center" data-testid="link-home">
          <PodCapWordmark />
        </a>
        <div className="flex items-center gap-4">
          {user ? (
            <a
              href="/dashboard"
              className="text-base font-medium text-primary hover:text-primary/80 transition-colors"
              data-testid="link-dashboard"
            >
              Dashboard
            </a>
          ) : (
            <>
              <a
                href="/get-started"
                className="flex items-center gap-1.5 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-[15px] font-semibold text-primary tracking-wide uppercase hover:bg-primary/15 transition-colors"
                data-testid="link-nav-get-started"
              >
                <Zap className="w-3.5 h-3.5" />
                Build Your Recap
              </a>
              <a
                href="/login"
                className="text-base font-medium text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-login"
              >
                Log in
              </a>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20">
        <section className="w-full max-w-4xl pt-10 sm:pt-16 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center text-center gap-4"
          >
            <h1
              className="text-3xl sm:text-4xl md:text-5xl font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em]"
              data-testid="heading-leaderboard"
            >
              Browse Top Podcasts
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
              Get free AI-powered recaps for any of the top podcasts delivered to your inbox.
            </p>
            <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">
              Can't find your favorite podcast? No problem —{" "}
              <Link href="/" className="text-primary font-medium hover:underline" data-testid="link-search-all">
                click here to search all podcasts
              </Link>.
            </p>
          </motion.div>
        </section>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full max-w-4xl"
        >
          <div className="mb-5 space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search podcasts by name, category, or host..."
                className="w-full h-12 pl-11 pr-10 bg-white border border-black/[0.08] rounded-xl text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium placeholder:text-muted-foreground/50 shadow-sm"
                data-testid="input-podcast-search"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-black/[0.05] transition-colors"
                  data-testid="button-clear-search"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2" data-testid="category-filters">
              <span
                className="px-3.5 py-1.5 rounded-full text-[15px] font-bold bg-primary text-white shadow-sm"
                data-testid="filter-all"
              >
                All
              </span>
              {availableGroups.map(group => {
                const slug = DISPLAY_TO_CATEGORY_SLUG[group];
                if (!slug) return null;
                return (
                  <a
                    key={group}
                    href={`/podcasts/${slug}`}
                    className="px-3.5 py-1.5 rounded-full text-[15px] font-bold transition-all bg-black/[0.04] text-muted-foreground hover:bg-black/[0.08] hover:text-foreground"
                    data-testid={`filter-${group.toLowerCase().replace(/[^a-z]/g, "-")}`}
                  >
                    {group}
                  </a>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 sm:px-8 py-4 border-b border-black/[0.06] flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-primary" />
                <span className="text-base font-display font-bold text-foreground">
                  All Podcasts
                </span>
              </div>
              <span className="text-base text-[#3F3F46] dark:text-[#A1A1AA] font-medium">
                {searchTerm ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""}` : ""}
              </span>
            </div>

            {filtered.length === 0 ? (
              <div className="px-8 py-16 text-center">
                <Headphones className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-base font-medium text-muted-foreground mb-1">No podcasts found</p>
                <p className="text-[15px] text-muted-foreground/70">
                  Try a different search or{" "}
                  <button onClick={() => { setSearchTerm(""); }} className="text-primary hover:underline" data-testid="button-clear-filters">
                    clear all filters
                  </button>
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 divide-y sm:divide-y-0 divide-black/[0.04]">
                {filtered.map((podcast, index) => (
                  <a
                    key={podcast.slug}
                    href={`/podcasts/${podcast.slug}`}
                    className="flex items-center gap-4 px-6 sm:px-7 py-5 transition-colors hover:bg-black/[0.015] group/row border-b border-black/[0.04] sm:border-r sm:last:border-r-0"
                    data-testid={`global-leader-row-${index}`}
                  >
                    {podcast.artworkUrl ? (
                      <img
                        src={podcast.artworkUrl}
                        alt={podcast.name}
                        className="w-14 h-14 rounded-xl object-cover shrink-0 shadow-md shadow-black/[0.06]"
                        data-testid={`global-artwork-${index}`}
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
                      <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-0.5">
                        {podcast.category}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {exploreByTopic.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="w-full max-w-4xl mt-12"
            data-testid="section-explore-by-topic"
          >
            <div className="flex items-center gap-3 mb-6">
              <Tag className="w-5 h-5 text-primary" />
              <h2 className="text-xl sm:text-2xl font-display font-extrabold text-foreground">
                Explore by Topic
              </h2>
            </div>

            <div className="space-y-6">
              {exploreByTopic.map(({ categorySlug, categoryName, topics }) => (
                <div key={categorySlug}>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-base font-bold text-foreground">{categoryName}</h3>
                    <a
                      href={`/podcasts/${categorySlug}`}
                      className="text-[15px] font-medium text-primary hover:underline flex items-center gap-1"
                      data-testid={`link-category-${categorySlug}`}
                    >
                      View all
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {topics.map(topic => (
                      <a
                        key={topic.slug}
                        href={`/podcasts/${categorySlug}/${topic.slug}`}
                        className="bg-white border border-black/[0.06] rounded-xl p-4 transition-colors hover:bg-black/[0.015] group"
                        data-testid={`topic-card-${categorySlug}-${topic.slug}`}
                      >
                        <p className="text-[15px] font-bold text-foreground group-hover:text-primary transition-colors">
                          {topic.name}
                        </p>
                        <p className="text-[13px] text-muted-foreground mt-1 line-clamp-2">
                          {topic.description}
                        </p>
                        <p className="text-[13px] text-muted-foreground/70 mt-2 font-medium">
                          {topic.count} podcasts
                        </p>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}
      </main>

      <Footer />
    </div>
  );
}
