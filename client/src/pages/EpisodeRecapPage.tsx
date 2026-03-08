import { useParams, useLocation } from "wouter";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Lightbulb, Quote, Tag, HelpCircle, MessageSquare, ChevronDown, ChevronUp, Send, Loader2, Sparkles } from "lucide-react";
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

  const handleTopicClick = (topic: string) => {
    const question = `What did this episode say about ${topic.toLowerCase()}?`;
    setAskInput(question);
    setAskAnswer(null);
    askMutation.mutate(question);
    setTimeout(() => {
      askSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
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
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      >
        <nav className="flex items-center gap-2 flex-wrap mb-8 pb-4 border-b border-black/[0.05] dark:border-white/[0.05]" data-testid="nav-in-page">
          <button
            onClick={() => scrollTo("section-tldl")}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary/[0.06] text-primary hover:bg-primary/[0.12] transition-colors"
            data-testid="nav-tldl"
          >
            TLDL
          </button>
          {episode.keyInsights.length > 0 && (
            <button
              onClick={() => scrollTo("section-key-insights")}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors"
              data-testid="nav-key-insights"
            >
              Key Insights
            </button>
          )}
          <button
            onClick={() => scrollTo("section-what-happened")}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors"
            data-testid="nav-what-happened"
          >
            Episode Breakdown
          </button>
          {hasKeyTopics && (
            <button
              onClick={() => scrollTo("section-key-topics")}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors"
              data-testid="nav-key-topics"
            >
              Key Topics
            </button>
          )}
          {hasTopQuestions && (
            <button
              onClick={() => scrollTo("section-top-questions")}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors"
              data-testid="nav-top-questions"
            >
              Top Questions
            </button>
          )}
          <button
            onClick={() => scrollTo("section-ask-episode")}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors"
            data-testid="nav-ask"
          >
            Ask About This Episode
          </button>
        </nav>

        <div id="section-tldl" className="relative bg-gradient-to-br from-primary/[0.05] to-primary/[0.02] border border-primary/[0.1] rounded-2xl px-6 py-5 sm:px-7 sm:py-6 mb-12" data-testid="section-tldl">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/[0.1]">
              <Clock className="w-3.5 h-3.5 text-primary" />
            </span>
            <span className="text-xs font-bold text-primary uppercase tracking-wider">TLDL — Too Long, Didn't Listen</span>
          </div>
          <p className="text-[17px] leading-[1.85] text-foreground font-medium">{episode.tldl}</p>
        </div>

        {episode.keyInsights.length > 0 && (
          <section id="section-key-insights" className="mb-12" data-testid="section-key-insights">
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

        {whatHappenedParagraphs.length > 0 && (
          <section id="section-what-happened" className="mb-12" data-testid="section-what-happened">
            <h2 className="text-xl sm:text-[22px] font-display font-bold text-foreground mb-5 flex items-center gap-2.5">
              <span className="w-1 h-6 rounded-full bg-primary" />
              Episode Breakdown
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

        {hasKeyTopics && (
          <section id="section-key-topics" className="mb-12" data-testid="section-key-topics">
            <h2 className="text-xl sm:text-[22px] font-display font-bold text-foreground mb-5 flex items-center gap-2.5">
              <span className="w-1 h-6 rounded-full bg-emerald-400" />
              Key Topics From This Episode
            </h2>
            <div className="flex flex-wrap gap-2.5">
              {keyTopics.map((topic, i) => (
                <button
                  key={i}
                  onClick={() => handleTopicClick(topic)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-xl text-[14px] font-medium text-foreground hover:border-primary/30 hover:bg-primary/[0.04] hover:text-primary transition-all shadow-sm shadow-black/[0.02] active:scale-[0.97]"
                  data-testid={`topic-chip-${i}`}
                >
                  <Tag className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  {topic}
                </button>
              ))}
            </div>
          </section>
        )}

        {hasTopQuestions && (
          <section id="section-top-questions" className="mb-12" data-testid="section-top-questions">
            <h2 className="text-xl sm:text-[22px] font-display font-bold text-foreground mb-5 flex items-center gap-2.5">
              <span className="w-1 h-6 rounded-full bg-violet-400" />
              Top Questions From This Episode
            </h2>
            <div className="space-y-3">
              {topQuestions.map((item, i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.08] rounded-xl overflow-hidden shadow-sm shadow-black/[0.02]"
                  data-testid={`question-item-${i}`}
                >
                  <button
                    onClick={() => setExpandedQuestion(expandedQuestion === i ? null : i)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                    data-testid={`question-toggle-${i}`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-500 shrink-0 mt-0.5">
                        <HelpCircle className="w-3.5 h-3.5" />
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
                        <div className="px-5 pb-5 pl-14">
                          {item.answer.split("\n\n").filter(Boolean).map((p, j) => (
                            <p key={j} className="text-[15px] leading-[1.8] text-muted-foreground mb-3 last:mb-0">{p}</p>
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

        <section id="section-ask-episode" ref={askSectionRef} className="mb-12" data-testid="section-ask-episode">
          <div className="relative bg-gradient-to-br from-violet-500/[0.04] to-primary/[0.03] border border-violet-500/[0.1] rounded-2xl px-6 py-6 sm:px-7 sm:py-7">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-500/[0.1]">
                <Sparkles className="w-3.5 h-3.5 text-violet-500" />
              </span>
              <span className="text-sm font-bold text-foreground">Ask About This Episode</span>
            </div>
            <form onSubmit={handleAskSubmit} className="flex gap-2" data-testid="form-ask-episode">
              <input
                type="text"
                value={askInput}
                onChange={(e) => setAskInput(e.target.value)}
                placeholder="What did this episode say about..."
                className="flex-1 h-11 px-4 bg-white dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] rounded-xl text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/30 transition-all placeholder:text-muted-foreground/40"
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
                <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2.5">Example questions:</p>
                <div className="flex flex-wrap gap-2">
                  {topQuestions.slice(0, 4).map((item, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setAskInput(item.question);
                        setAskAnswer(null);
                        askMutation.mutate(item.question);
                      }}
                      className="text-[13px] text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 hover:bg-violet-500/[0.06] px-2.5 py-1 rounded-lg transition-colors text-left"
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
                  className="mt-5 bg-white dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-xl px-5 py-4"
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
