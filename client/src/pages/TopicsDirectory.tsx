import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { Search, ArrowRight, Zap, Brain, Rocket, Lightbulb, TrendingUp, BarChart3, Wallet, Crown, Users, Megaphone, Handshake, Cpu, LineChart, Building2, Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe, Sparkles, GitFork } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import { TOPICS, matchesKeywords } from "@/data/topicData";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { PEOPLE_DIRECTORY, COMPANIES_DIRECTORY } from "@/data/entityDirectoryData";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

const ICON_MAP: Record<string, any> = {
  Brain, Rocket, Lightbulb, TrendingUp, BarChart3, Wallet, Crown, Users,
  Megaphone, Handshake, Zap, GitFork, Sparkles, Cpu, LineChart, Building2,
  Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe,
};

function getTopicCounts(topic: typeof TOPICS[0]) {
  const podcastCount = PODCAST_LANDINGS.filter(p => {
    const text = `${p.category} ${p.keywords} ${p.description}`;
    return matchesKeywords(text, topic.podcastKeywords);
  }).length;

  const peopleCount = PEOPLE_DIRECTORY.filter(p =>
    topic.peopleCategories.includes(p.category)
  ).length;

  const companyCount = COMPANIES_DIRECTORY.filter(c => {
    const text = `${c.details.industry} ${c.description}`;
    return matchesKeywords(text, topic.companyKeywords);
  }).length;

  return { podcastCount, peopleCount, companyCount };
}

function SEOHead() {
  const title = "Podcast Topics — Explore Knowledge by Subject | PodCap";
  const description = "Browse 25 topics across top podcasts. From AI and entrepreneurship to psychology and geopolitics — find podcast recaps, summaries, and transcripts organized by the subjects that matter most.";

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

export default function TopicsDirectory() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTopics = useMemo(() => {
    if (!searchQuery.trim()) return TOPICS;
    const q = searchQuery.toLowerCase().trim();
    return TOPICS.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.podcastKeywords.some(kw => kw.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-background">
      <SEOHead />

      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-black/[0.04] dark:border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" data-testid="link-home">
            <img src={logoPath} alt="PodCap" className="h-7 object-contain" />
          </Link>
          <div className="flex items-center gap-3">
            {!user && (
              <button
                onClick={() => navigate("/get-started")}
                className="px-4 py-2 rounded-full text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                data-testid="button-build-recap"
              >
                Build Your Recap
              </button>
            )}
            <button
              onClick={() => navigate(user ? "/dashboard" : "/login")}
              className="px-4 py-2 rounded-full text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
              data-testid="button-login"
            >
              {user ? "Dashboard" : "Log In"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pt-12 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-medium text-primary" data-testid="text-section-label">Topics</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground mb-3" data-testid="text-page-title">
            Explore by Topic
          </h1>
          <p className="text-base text-muted-foreground max-w-2xl" data-testid="text-page-description">
            Discover podcast knowledge organized by the subjects that matter most — connecting you to the podcasts, people, and companies shaping each field.
          </p>
        </motion.div>

        <div className="relative mb-8 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="Search topics..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-muted/50 border border-black/[0.06] dark:border-white/[0.06] rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
            data-testid="input-search-topics"
          />
        </div>

        <p className="text-sm text-muted-foreground mb-6" data-testid="text-results-count">
          {filteredTopics.length} topic{filteredTopics.length !== 1 ? "s" : ""}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTopics.map((topic, i) => {
            const Icon = ICON_MAP[topic.icon] || Sparkles;
            const counts = getTopicCounts(topic);

            return (
              <motion.div
                key={topic.slug}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.5) }}
              >
                <Link href={`/topics/${topic.slug}`} data-testid={`card-topic-${topic.slug}`}>
                  <div className="group relative bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-5 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer h-full">
                    <div className="flex items-start gap-3.5 mb-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${topic.color} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors" data-testid={`text-topic-name-${topic.slug}`}>
                          {topic.name}
                        </h3>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
                    </div>
                    <p className="text-sm text-muted-foreground/70 line-clamp-2 mb-3">
                      {topic.description}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground/50">
                      {counts.podcastCount > 0 && (
                        <span>{counts.podcastCount} podcast{counts.podcastCount !== 1 ? "s" : ""}</span>
                      )}
                      {counts.peopleCount > 0 && (
                        <>
                          <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/30" />
                          <span>{counts.peopleCount} people</span>
                        </>
                      )}
                      {counts.companyCount > 0 && (
                        <>
                          <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/30" />
                          <span>{counts.companyCount} compan{counts.companyCount !== 1 ? "ies" : "y"}</span>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {filteredTopics.length === 0 && (
          <div className="text-center py-20">
            <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground" data-testid="text-no-results">No topics match your search</p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
