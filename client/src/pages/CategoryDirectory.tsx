import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import { ArrowRight, Brain, Rocket, Lightbulb, TrendingUp, BarChart3, Wallet, Crown, Users, Megaphone, Handshake, Zap, GitFork, Sparkles, Cpu, LineChart, Building2, Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe, UserPlus, Cloud, GitBranch, Layout, Target, Cog, Bot, Coins, Leaf, Shield, Hammer, Briefcase, Code, DollarSign, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { INDUSTRIES, INTERESTS, ROLES, type TopicCategory } from "@/data/topicData";
import { SiteHeader } from "@/components/SiteHeader";
import { InlineEmailCTA } from "@/components/InlineEmailCTA";
import { StickyEmailBar } from "@/components/StickyEmailBar";
import { useSetConversion } from "@/contexts/PageConversionContext";

const ICON_MAP: Record<string, any> = {
  Brain, Rocket, Lightbulb, TrendingUp, BarChart3, Wallet, Crown, Users,
  Megaphone, Handshake, Zap, GitFork, Sparkles, Cpu, LineChart, Building2,
  Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe,
  UserPlus, Cloud, GitBranch, Layout, Target, Cog, Bot, Coins, Leaf, Shield,
  Hammer, Briefcase, Code, DollarSign,
};

const CATEGORY_META: Record<string, { title: string; subtitle: string; description: string; category: TopicCategory }> = {
  industries: {
    title: "Industries",
    subtitle: "Explore podcast intelligence by industry",
    description: "Track what the world's top podcasters are saying about the industries shaping the future. AI-powered insights from hundreds of episodes.",
    category: "industry",
  },
  interests: {
    title: "Interests",
    subtitle: "Explore podcast intelligence by interest",
    description: "From health to productivity to investing, explore what top podcasters are discussing about the topics you care about most.",
    category: "interest",
  },
  roles: {
    title: "Roles",
    subtitle: "Podcast intelligence for your role",
    description: "Whether you're a founder, marketer, or engineer, get curated podcast intelligence tailored to your professional role.",
    category: "role",
  },
};

function SEOHead({ title, description }: { title: string; description: string }) {
  if (typeof document !== "undefined") {
    document.title = `${title} - Podcast Intelligence | PodCap`;
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
    setOrCreate('meta[property="og:title"]', "property", `${title} | PodCap`);
    setOrCreate('meta[property="og:description"]', "property", description);
    setOrCreate('meta[property="og:image"]', "property", "https://podcap.io/og/og-podcasts.png");
    setOrCreate('meta[name="twitter:card"]', "name", "summary_large_image");
  }
  return null;
}

export default function CategoryDirectory() {
  const [isIndustries] = useRoute("/industries");
  const [isInterests] = useRoute("/interests");
  const [isRoles] = useRoute("/roles");

  const pathKey = isIndustries ? "industries" : isInterests ? "interests" : "roles";
  const meta = CATEGORY_META[pathKey];
  const topics = pathKey === "industries" ? INDUSTRIES : pathKey === "interests" ? INTERESTS : ROLES;
  const basePath = `/${pathKey}`;

  const otherCategories = useMemo(() => {
    return Object.entries(CATEGORY_META).filter(([key]) => key !== pathKey);
  }, [pathKey]);

  useSetConversion({
    pageType: "category",
    name: meta.title,
    slug: pathKey,
    categoryType: meta.category,
  });

  const ctaInsertIndex = Math.min(Math.floor(topics.length / 2), 9);

  return (
    <div className="min-h-screen bg-background" data-testid="category-directory">
      <SEOHead title={meta.title} description={meta.description} />
      <SiteHeader />

      <main className="max-w-5xl mx-auto px-4 pt-12 pb-16">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <h1 className="text-4xl font-bold tracking-tight text-foreground" data-testid="category-title">{meta.title}</h1>
          <p className="text-lg text-muted-foreground mt-2 max-w-2xl" data-testid="category-subtitle">{meta.subtitle}</p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
          {topics.map((topic, i) => {
            const IconComp = ICON_MAP[topic.icon] || Brain;
            return (
              <motion.div
                key={topic.slug}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.03 }}
              >
                <Link
                  href={`${basePath}/${topic.slug}`}
                  className="group block p-5 rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-white/[0.02] hover:border-black/[0.12] dark:hover:border-white/[0.15] hover:shadow-sm transition-all"
                  data-testid={`topic-card-${topic.slug}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${topic.color} flex items-center justify-center flex-shrink-0`}>
                      <IconComp className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-[16px] text-foreground group-hover:text-primary transition-colors">{topic.name}</h3>
                        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{topic.description}</p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-12 mb-12">
          <InlineEmailCTA
            type={meta.category}
            slug={pathKey}
            name={meta.title}
            variant="gradient"
          />
        </div>

        <div className="mt-16 pt-8 border-t border-black/[0.06] dark:border-white/[0.06]">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Also explore</h2>
          <div className="flex flex-wrap gap-3">
            {otherCategories.map(([key, cat]) => (
              <Link
                key={key}
                href={`/${key}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-black/[0.08] dark:border-white/[0.1] text-sm font-medium text-foreground hover:border-primary hover:text-primary transition-colors"
                data-testid={`explore-${key}`}
              >
                {cat.title}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ))}
          </div>
        </div>
      </main>

      <Footer />

      <StickyEmailBar
        type={meta.category}
        slug={pathKey}
        name={meta.title}
      />
    </div>
  );
}
