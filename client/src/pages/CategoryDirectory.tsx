import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowRight, Brain, Rocket, Lightbulb, TrendingUp, BarChart3, Wallet, Crown, Users, Megaphone, Handshake, Zap, GitFork, Sparkles, Cpu, LineChart, Building2, Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe, UserPlus, Cloud, GitBranch, Layout, Target, Cog, Bot, Coins, Leaf, Shield, Hammer, Briefcase, Code, DollarSign, ChevronRight, Mail, Loader2, Check } from "lucide-react";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { Footer } from "@/components/Footer";
import { INDUSTRIES, INTERESTS, ROLES, type TopicCategory } from "@/data/topicData";
import { SiteHeader } from "@/components/SiteHeader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  }
  return null;
}

function CategoryNewsletterCTA({ category, categoryLabel }: { category: TopicCategory; categoryLabel: string }) {
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();
  const topicType = category === "industry" ? "industry" : category === "interest" ? "interest" : "role";
  const briefingLabel = category === "industry" ? "industry" : category === "interest" ? "interest" : "role";

  const subscribe = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscriptions/quick-subscribe", {
        email,
        type: topicType,
        slug: `all-${category}`,
        name: `All ${categoryLabel}`,
      });
      return res.json();
    },
    onSuccess: () => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: `Subscribed to ${categoryLabel}`, description: "You'll receive briefings in your inbox." });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't subscribe", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  if (success) {
    return (
      <div className="mt-10 rounded-2xl border border-green-500/20 bg-green-500/[0.04] p-6" data-testid="category-newsletter-success">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center">
            <Check className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-foreground">You're subscribed!</p>
            <p className="text-[14px] text-muted-foreground mt-0.5">We'll send {briefingLabel} briefings to your inbox.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-10 rounded-2xl bg-gradient-to-r from-primary/[0.06] via-primary/[0.03] to-transparent border border-primary/[0.12] p-6 sm:p-8" data-testid="category-newsletter-cta">
      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-4 h-4 text-primary" />
            <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-primary">Stay informed</span>
          </div>
          <h3 className="text-lg font-bold text-foreground">
            Get {categoryLabel.toLowerCase()} briefings in your inbox
          </h3>
          <p className="text-[14px] text-muted-foreground mt-1">
            Key insights from top podcasts about {categoryLabel.toLowerCase()}, delivered daily.
          </p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (email.trim()) subscribe.mutate(); }} className="flex gap-2 shrink-0">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-[220px] pl-10 pr-4 py-2.5 text-[14px] bg-card border border-black/[0.1] dark:border-white/[0.1] rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
              data-testid="input-category-newsletter-email"
            />
          </div>
          <button
            type="submit"
            disabled={subscribe.isPending}
            className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-[14px] rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
            data-testid="button-category-newsletter-subscribe"
          >
            {subscribe.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Subscribe"}
          </button>
        </form>
      </div>
    </div>
  );
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

        <CategoryNewsletterCTA category={meta.category} categoryLabel={meta.title} />

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
    </div>
  );
}
