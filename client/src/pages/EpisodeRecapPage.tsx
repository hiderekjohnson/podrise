import { useParams } from "wouter";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Lightbulb, Quote, Tag, HelpCircle, MessageSquare, ChevronDown, ChevronUp, Send, Loader2, Sparkles, BookOpen, ListChecks, MessageCircleQuestion, Heart, ExternalLink, TicketPercent, BookMarked, Wrench, Globe, Mail, GraduationCap, ShoppingBag, Server, Package } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getPodcastBySlug } from "../data/podcastLandingData";
import { Link } from "wouter";
import { EpisodePageLayout } from "@/components/EpisodePageLayout";

interface TopQuestion {
  question: string;
  answer: string;
}

export default function EpisodeRecapPage() {
  const params = useParams<{ podcastSlug: string; episodeSlug: string }>();
  const podcastSlug = params.podcastSlug || "";
  const episodeSlug = params.episodeSlug || "";
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null);
  const [askInput, setAskInput] = useState("");
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("section-tldl");
  const askSectionRef = useRef<HTMLDivElement>(null);

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

  interface Sponsor {
    name: string;
    description: string;
    deal?: string | null;
    couponCode?: string | null;
    url?: string | null;
    callToAction?: string | null;
  }

  interface Resource {
    name: string;
    type: string;
    description: string;
    url: string | null;
    author: string | null;
    context: string;
  }

  const { data: sponsorsData, isLoading: sponsorsLoading } = useQuery<{ sponsors: Sponsor[] }>({
    queryKey: ["/api/podcasts", podcastSlug, episodeSlug, "sponsors"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/${episodeSlug}/sponsors`);
      if (!res.ok) return { sponsors: [] };
      return res.json();
    },
    enabled: !!podcastSlug && !!episodeSlug,
  });

  const sponsors = sponsorsData?.sponsors || [];

  const { data: resourcesData, isLoading: resourcesLoading } = useQuery<{ resources: Resource[] }>({
    queryKey: ["/api/podcasts", podcastSlug, episodeSlug, "resources"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/${episodeSlug}/resources`);
      if (!res.ok) return { resources: [] };
      return res.json();
    },
    enabled: !!podcastSlug && !!episodeSlug,
  });

  const resources = resourcesData?.resources || [];

  const askMutation = useMutation({
    mutationFn: async (question: string) => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/${episodeSlug}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error("Failed to get answer");
      return res.json();
    },
    onSuccess: (data) => {
      setAskAnswer(data.answer);
    },
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

  useEffect(() => {
    const sectionIds = [
      "section-tldl",
      "section-key-insights",
      "section-what-happened",
      "section-key-topics",
      "section-top-questions",
      "section-ask-episode",
      "section-sponsors",
      "section-resources",
    ];

    const handleScroll = () => {
      const offset = 56 + 52 + 40;
      let current = sectionIds[0];
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= offset) {
          current = id;
        }
      }
      setActiveSection(current);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [episode]);

  const resourceTypeConfig: Record<string, { icon: typeof BookOpen; color: string; bg: string }> = {
    book: { icon: BookMarked, color: "text-amber-600", bg: "bg-amber-50" },
    supplement: { icon: Package, color: "text-green-600", bg: "bg-green-50" },
    tool: { icon: Wrench, color: "text-blue-600", bg: "bg-blue-50" },
    app: { icon: Package, color: "text-purple-600", bg: "bg-purple-50" },
    software: { icon: Globe, color: "text-indigo-600", bg: "bg-indigo-50" },
    course: { icon: GraduationCap, color: "text-indigo-600", bg: "bg-indigo-50" },
    newsletter: { icon: Mail, color: "text-rose-600", bg: "bg-rose-50" },
    product: { icon: Package, color: "text-emerald-600", bg: "bg-emerald-50" },
    gear: { icon: Wrench, color: "text-slate-600", bg: "bg-slate-50" },
    service: { icon: Server, color: "text-teal-600", bg: "bg-teal-50" },
    other: { icon: BookOpen, color: "text-gray-600", bg: "bg-gray-50" },
  };

  function getResourceTypeConfig(type: string) {
    return resourceTypeConfig[type] || resourceTypeConfig.other;
  }

  function safeResourceUrl(url: string | null): string | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
    } catch {}
    return null;
  }

  function addUtmParams(url: string, campaign: string): string {
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      if (!u.searchParams.has("utm_source")) u.searchParams.set("utm_source", "podcap");
      if (!u.searchParams.has("utm_medium")) u.searchParams.set("utm_medium", "referral");
      if (!u.searchParams.has("utm_campaign")) u.searchParams.set("utm_campaign", campaign);
      return u.toString();
    } catch {
      return url;
    }
  }

  const handleTopicClick = (topic: string) => {
    const question = `What did this episode say about ${topic.toLowerCase()}?`;
    setAskInput(question);
    setAskAnswer(null);
    askMutation.mutate(question);
    setTimeout(() => {
      scrollTo("section-ask-episode");
    }, 100);
  };

  const handleAskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!askInput.trim() || askMutation.isPending) return;
    setAskAnswer(null);
    askMutation.mutate(askInput.trim());
  };

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
  const keyTopics: string[] = episode.keyTopics || [];
  let topQuestions: TopQuestion[] = [];
  try {
    topQuestions = episode.topQuestions ? (typeof episode.topQuestions === "string" ? JSON.parse(episode.topQuestions) : episode.topQuestions) : [];
  } catch { topQuestions = []; }

  const hasKeyTopics = keyTopics.length > 0;
  const hasTopQuestions = topQuestions.length > 0;

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const headerHeight = 56;
    const navHeight = 52;
    const offset = headerHeight + navHeight + 16;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };

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
        className="space-y-6"
      >
        <nav className="sticky top-[56px] z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2.5 bg-background/90 backdrop-blur-md border-b border-black/[0.06] flex items-center gap-2 overflow-x-auto hide-scrollbar" data-testid="nav-in-page">
          <button
            onClick={() => scrollTo("section-tldl")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-tldl" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
            data-testid="nav-tldl"
          >
            Quick Summary
          </button>
          {episode.keyInsights?.length > 0 && (
            <button
              onClick={() => scrollTo("section-key-insights")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-key-insights" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-key-insights"
            >
              Key Takeaways
            </button>
          )}
          <button
            onClick={() => scrollTo("section-what-happened")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-what-happened" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
            data-testid="nav-what-happened"
          >
            Summary
          </button>
          {hasKeyTopics && (
            <button
              onClick={() => scrollTo("section-key-topics")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-key-topics" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-key-topics"
            >
              Key Topics
            </button>
          )}
          {hasTopQuestions && (
            <button
              onClick={() => scrollTo("section-top-questions")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-top-questions" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-top-questions"
            >
              Quick Q&A
            </button>
          )}
          <button
            onClick={() => scrollTo("section-ask-episode")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-ask-episode" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
            data-testid="nav-ask"
          >
            Podcast Chat
          </button>
          {sponsors.length > 0 && (
            <button
              onClick={() => scrollTo("section-sponsors")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-sponsors" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-sponsors"
            >
              Sponsors
            </button>
          )}
          {(resources.length > 0 || resourcesLoading) && (
            <button
              onClick={() => scrollTo("section-resources")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${activeSection === "section-resources" ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid="nav-resources"
            >
              Shop the Episode
            </button>
          )}
        </nav>

        <section id="section-tldl" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-tldl">
          <div className="flex items-center gap-2.5 px-6 py-3.5 bg-primary/[0.04] border-b border-primary/[0.08]">
            <Clock className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-primary uppercase tracking-wider">Quick Summary</span>
          </div>
          <div className="px-6 py-5">
            <p className="text-[17px] leading-[1.85] text-foreground font-medium">{episode.tldl}</p>
          </div>
          {episode.quote && (
            <div className="mx-6 mb-5 bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.06] rounded-xl px-5 py-4" data-testid="section-quote">
              <div className="flex gap-3">
                <Quote className="w-5 h-5 text-primary/30 shrink-0 mt-0.5" />
                <div>
                  <blockquote className="text-[15px] leading-[1.75] text-foreground/80 italic">
                    "{episode.quote}"
                  </blockquote>
                  {episode.quoteAttribution && (
                    <p className="mt-2 text-xs font-semibold text-muted-foreground">— {episode.quoteAttribution}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {episode.keyInsights?.length > 0 && (
          <section id="section-key-insights" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-key-insights">
            <div className="flex items-center gap-2.5 px-6 py-3.5 bg-amber-500/[0.04] border-b border-amber-500/[0.08]">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Key Takeaways</span>
            </div>
            <div className="px-6 py-5 space-y-3">
              {episode.keyInsights.map((insight: string, i: number) => (
                <div
                  key={i}
                  className="flex gap-3.5 items-start"
                  data-testid={`insight-${i}`}
                >
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 text-xs font-bold">
                    {i + 1}
                  </span>
                  <p className="text-[15px] leading-[1.75] text-muted-foreground">{insight}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section id="section-what-happened" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-what-happened">
          <div className="flex items-center gap-2.5 px-6 py-3.5 bg-primary/[0.04] border-b border-primary/[0.08]">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-primary uppercase tracking-wider">Summary</span>
          </div>
          <div className="px-6 py-5 space-y-5">
            {whatHappenedParagraphs.map((paragraph: string, i: number) => (
              <p key={i} className="text-[16px] leading-[1.85] text-muted-foreground">
                {i === 0 && <span className="text-foreground font-semibold">{paragraph.split(" ").slice(0, 3).join(" ")} </span>}
                {i === 0 ? paragraph.split(" ").slice(3).join(" ") : paragraph}
              </p>
            ))}
          </div>
          <div className="px-6 pb-5">
            <Link
              href={`/podcasts/${podcastSlug}/${episodeSlug}/transcript`}
              className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline"
              data-testid="link-full-transcript"
            >
              Read the full transcript →
            </Link>
          </div>
        </section>

        {hasKeyTopics && (
          <section id="section-key-topics" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-key-topics">
            <div className="flex items-center gap-2.5 px-6 py-3.5 bg-emerald-500/[0.04] border-b border-emerald-500/[0.08]">
              <Tag className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Key Topics</span>
            </div>
            <div className="px-6 py-5">
              <p className="text-xs text-muted-foreground mb-3">Click a topic to ask the AI about it</p>
              <div className="flex flex-wrap gap-2">
                {keyTopics.map((topic: string, i: number) => (
                  <button
                    key={i}
                    onClick={() => handleTopicClick(topic)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500/[0.04] border border-emerald-500/[0.1] rounded-lg text-sm font-medium text-foreground hover:border-emerald-500/30 hover:bg-emerald-500/[0.08] transition-all active:scale-[0.97]"
                    data-testid={`topic-chip-${i}`}
                  >
                    <Tag className="w-3 h-3 text-emerald-500 shrink-0" />
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {hasTopQuestions && (
          <section id="section-top-questions" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-top-questions">
            <div className="flex items-center gap-2.5 px-6 py-3.5 bg-violet-500/[0.04] border-b border-violet-500/[0.08]">
              <MessageCircleQuestion className="w-4 h-4 text-violet-500" />
              <span className="text-sm font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wider">Quick Q&A</span>
            </div>
            <div className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
              {topQuestions.map((item, i) => (
                <div key={i} data-testid={`question-item-${i}`}>
                  <button
                    onClick={() => setExpandedQuestion(expandedQuestion === i ? null : i)}
                    className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors"
                    data-testid={`question-toggle-${i}`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-500 shrink-0 mt-0.5">
                        <HelpCircle className="w-3 h-3" />
                      </span>
                      <span className="text-[15px] font-semibold text-foreground leading-snug">{item.question}</span>
                    </div>
                    {expandedQuestion === i ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                  <AnimatePresence>
                    {expandedQuestion === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="px-6 pb-5 pl-[3.25rem]">
                          {item.answer.split("\n\n").filter(Boolean).map((p, j) => (
                            <p key={j} className="text-[15px] leading-[1.8] text-muted-foreground mb-2.5 last:mb-0">{p}</p>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </section>
        )}

        <section id="section-ask-episode" ref={askSectionRef} className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-ask-episode">
          <div className="flex items-center gap-2.5 px-6 py-3.5 bg-violet-500/[0.04] border-b border-violet-500/[0.08]">
            <Sparkles className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wider">Podcast Chat</span>
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-violet-500 bg-violet-500/[0.08] px-2 py-0.5 rounded-full uppercase tracking-wider"><Sparkles className="w-3 h-3" /> AI</span>
          </div>
          <div className="px-6 py-5">
            <p className="text-sm text-muted-foreground mb-4">Ask any question and get an answer based on the episode transcript.</p>
            <form onSubmit={handleAskSubmit} className="flex gap-2" data-testid="form-ask-episode">
              <input
                type="text"
                value={askInput}
                onChange={(e) => setAskInput(e.target.value)}
                placeholder="What did this episode say about..."
                className="flex-1 h-11 px-4 bg-black/[0.02] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] rounded-xl text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/30 transition-all placeholder:text-muted-foreground/40"
                data-testid="input-ask-episode"
              />
              <button
                type="submit"
                disabled={!askInput.trim() || askMutation.isPending}
                className="h-11 px-5 flex items-center gap-2 rounded-xl font-bold text-sm bg-violet-500 text-white shadow-sm hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
                data-testid="button-ask-submit"
              >
                {askMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Ask
              </button>
            </form>

            {topQuestions.length > 0 && !askAnswer && !askMutation.isPending && (
              <div className="mt-4" data-testid="ask-example-prompts">
                <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Try asking:</p>
                <div className="flex flex-wrap gap-1.5">
                  {topQuestions.slice(0, 4).map((item, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setAskInput(item.question);
                        setAskAnswer(null);
                        askMutation.mutate(item.question);
                      }}
                      className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 hover:bg-violet-500/[0.06] px-2.5 py-1 rounded-lg transition-colors text-left"
                      data-testid={`ask-example-${i}`}
                    >
                      {item.question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence>
              {(askAnswer || askMutation.isPending) && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.3 }}
                  className="mt-5 bg-violet-500/[0.03] border border-violet-500/[0.1] rounded-xl px-5 py-4"
                  data-testid="ask-answer-container"
                >
                  {askMutation.isPending ? (
                    <div className="flex items-center gap-3 py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                      <span className="text-sm text-muted-foreground">Searching the transcript...</span>
                    </div>
                  ) : askAnswer ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare className="w-3.5 h-3.5 text-violet-500" />
                        <span className="text-xs font-bold text-violet-500 uppercase tracking-wider">Answer</span>
                      </div>
                      {askAnswer.split("\n\n").filter(Boolean).map((p, i) => (
                        <p key={i} className="text-[15px] leading-[1.8] text-muted-foreground">{p}</p>
                      ))}
                    </div>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>

            {askMutation.isError && (
              <p className="mt-3 text-sm text-red-500" data-testid="ask-error">
                Unable to generate an answer. The transcript may not be available for this episode.
              </p>
            )}
          </div>
        </section>
        {(sponsors.length > 0 || sponsorsLoading) && (
          <section id="section-sponsors" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-sponsors">
            <div className="flex items-center gap-2.5 px-6 py-3.5 bg-rose-500/[0.04] border-b border-rose-500/[0.08]">
              <Heart className="w-4 h-4 text-rose-500" />
              <span className="text-sm font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">Episode Sponsors</span>
            </div>
            <div className="px-6 py-5">
              <p className="text-[15px] leading-relaxed text-muted-foreground mb-5">
                Podcasts thrive because of the sponsors who support them. Please consider checking out the sponsors who made this episode possible — they help keep the show free for all of us.
                {resources.length > 0 && (
                  <span className="block mt-2 text-sm">
                    Looking for books and products mentioned in this episode?{" "}
                    <button onClick={() => scrollTo("section-resources")} className="text-primary font-semibold hover:underline" data-testid="link-sponsors-to-resources">
                      Shop the Episode
                    </button>
                  </span>
                )}
              </p>

              {sponsorsLoading ? (
                <div className="flex items-center gap-3 py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                  <span className="text-sm text-muted-foreground">Finding sponsors mentioned in this episode...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {sponsors.map((sponsor, i) => (
                    <div
                      key={i}
                      className="bg-rose-500/[0.02] border border-rose-500/[0.08] rounded-xl px-5 py-4"
                      data-testid={`sponsor-card-${i}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-rose-500/[0.1] shrink-0 mt-0.5">
                          <Heart className="w-4 h-4 text-rose-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[15px] font-bold text-foreground" data-testid={`sponsor-name-${i}`}>
                            {sponsor.name}
                          </h4>

                          {typeof sponsor.deal === "string" && sponsor.deal.trim() && (
                            <div className="mt-2 px-3.5 py-2.5 bg-emerald-500/[0.05] border border-emerald-500/[0.1] rounded-lg" data-testid={`sponsor-deal-${i}`}>
                              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                                <Tag className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                                {sponsor.deal}
                              </p>
                            </div>
                          )}

                          <p className="text-[15px] leading-[1.75] text-muted-foreground mt-2.5">
                            {sponsor.description}
                          </p>

                          {typeof sponsor.callToAction === "string" && sponsor.callToAction.trim() && (
                            <p className="text-[15px] leading-[1.75] text-muted-foreground mt-2" data-testid={`sponsor-cta-${i}`}>
                              {sponsor.callToAction}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            {typeof sponsor.url === "string" && sponsor.url.trim() && (
                              <a
                                href={addUtmParams(sponsor.url, "sponsor")}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/[0.06] border border-rose-500/[0.1] rounded-lg text-sm font-semibold text-rose-600 hover:bg-rose-500/[0.12] transition-colors"
                                data-testid={`sponsor-url-${i}`}
                              >
                                <ExternalLink className="w-3 h-3" />
                                {sponsor.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                              </a>
                            )}
                            {typeof sponsor.couponCode === "string" && sponsor.couponCode.trim() && (
                              <span
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/[0.06] border border-emerald-500/[0.1] rounded-lg text-sm font-bold text-emerald-700 dark:text-emerald-400 font-mono"
                                data-testid={`sponsor-code-${i}`}
                              >
                                <TicketPercent className="w-3 h-3" />
                                {sponsor.couponCode}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
        {(resources.length > 0 || resourcesLoading) && (
          <section id="section-resources" className="bg-white dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-sm shadow-black/[0.02]" data-testid="section-resources">
            <div className="flex items-center gap-2.5 px-6 py-3.5 bg-amber-500/[0.04] border-b border-amber-500/[0.08]">
              <ShoppingBag className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Shop the Episode</span>
            </div>
            <div className="px-6 py-5">
              <p className="text-[15px] leading-relaxed text-muted-foreground mb-5">
                Books, products, and tools organically mentioned in this episode — not paid promotions.
                {sponsors.length > 0 && (
                  <span className="block mt-2 text-sm">
                    To see paid sponsors for this episode,{" "}
                    <button onClick={() => scrollTo("section-sponsors")} className="text-primary font-semibold hover:underline" data-testid="link-resources-to-sponsors">
                      view Episode Sponsors
                    </button>
                  </span>
                )}
              </p>

              {resourcesLoading ? (
                <div className="flex items-center gap-3 py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                  <span className="text-sm text-muted-foreground">Finding products mentioned in this episode...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {resources.map((resource, i) => {
                    const config = getResourceTypeConfig(resource.type);
                    const Icon = config.icon;
                    const safe = safeResourceUrl(resource.url);
                    const isAmazon = safe?.includes("amazon.com");
                    return (
                      <div
                        key={i}
                        className="bg-amber-500/[0.02] border border-amber-500/[0.08] rounded-xl px-5 py-4"
                        data-testid={`resource-card-${i}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${config.bg} shrink-0 mt-0.5`}>
                            <Icon className={`w-4 h-4 ${config.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <h4 className="text-[15px] font-bold text-foreground" data-testid={`resource-name-${i}`}>
                                {resource.name}
                              </h4>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${config.bg} ${config.color}`}>
                                {resource.type}
                              </span>
                            </div>
                            {resource.author && (
                              <p className="text-xs text-muted-foreground font-medium mb-1">
                                by {resource.author}
                              </p>
                            )}
                            <p className="text-[15px] leading-[1.75] text-muted-foreground mt-1">
                              {resource.description}
                            </p>
                            {safe && (
                              <a
                                href={isAmazon ? safe : addUtmParams(safe, "resource")}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 mt-3 bg-amber-500/[0.06] border border-amber-500/[0.1] rounded-lg text-sm font-semibold text-amber-700 hover:bg-amber-500/[0.12] transition-colors"
                                data-testid={`resource-url-${i}`}
                              >
                                <ExternalLink className="w-3 h-3" />
                                {isAmazon ? "View on Amazon" : safe.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 40)}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {resources.length > 0 && (
                <p className="text-[11px] text-muted-foreground/50 mt-4">
                  Some links may include affiliate tags. Purchasing through these links supports PodCap at no extra cost to you.
                </p>
              )}
            </div>
          </section>
        )}
      </motion.article>
    </EpisodePageLayout>
  );
}
