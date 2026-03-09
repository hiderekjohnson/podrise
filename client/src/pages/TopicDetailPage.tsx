import { useMemo } from "react";
import { useLocation, Link, useParams } from "wouter";
import { ArrowLeft, ArrowRight, Headphones, Users, Building2, Brain, Rocket, Lightbulb, TrendingUp, BarChart3, Wallet, Crown, Megaphone, Handshake, Zap, Cpu, LineChart, Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe, Sparkles, GitFork, Mic, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import { TOPICS, matchesKeywords } from "@/data/topicData";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { PEOPLE_DIRECTORY, COMPANIES_DIRECTORY } from "@/data/entityDirectoryData";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

const ICON_MAP: Record<string, any> = {
  Brain, Rocket, Lightbulb, TrendingUp, BarChart3, Wallet, Crown, Users: Users,
  Megaphone, Handshake, Zap, GitFork, Sparkles, Cpu, LineChart, Building2,
  Heart, Flame, ArrowUpCircle, Scale, GraduationCap, Palette, Video, Globe,
};

interface PersonSummary {
  slug: string;
  name: string;
  title: string;
  mentionCount: number;
  guestCount: number;
  gender: string;
  category: string;
}

function SEOHead({ name, description }: { name: string; description: string }) {
  const title = `${name} — Podcasts, People & Companies | PodCap`;
  const desc = `Explore ${name.toLowerCase()} across top podcasts. ${description}`;

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
    setOrCreate('meta[name="description"]', "name", desc);
    setOrCreate('meta[property="og:title"]', "property", title);
    setOrCreate('meta[property="og:description"]', "property", desc);
  }
  return null;
}

export default function TopicDetailPage() {
  const params = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { data: user } = useAuth();

  const topic = TOPICS.find(t => t.slug === params.slug);

  const { data: peopleData } = useQuery<PersonSummary[]>({
    queryKey: ["/api/entities/people"],
  });

  const relatedPodcasts = useMemo(() => {
    if (!topic) return [];
    return PODCAST_LANDINGS.filter(p => {
      const text = `${p.category} ${p.keywords} ${p.description}`;
      return matchesKeywords(text, topic.podcastKeywords);
    }).slice(0, 12);
  }, [topic]);

  const relatedPeopleStatic = useMemo(() => {
    if (!topic) return [];
    return PEOPLE_DIRECTORY
      .filter(p => topic.peopleCategories.includes(p.category))
      .slice(0, 12);
  }, [topic]);

  const relatedPeople = useMemo(() => {
    if (!topic) return [];
    if (!peopleData) {
      return relatedPeopleStatic.map(p => ({
        slug: p.slug,
        name: p.name,
        title: p.title,
        mentionCount: 0,
        guestCount: 0,
        gender: p.gender,
        category: p.category,
      }));
    }
    const matchingSlugs = relatedPeopleStatic.map(p => p.slug);
    return peopleData
      .filter(p => matchingSlugs.includes(p.slug))
      .sort((a, b) => (b.guestCount + b.mentionCount) - (a.guestCount + a.mentionCount))
      .slice(0, 12);
  }, [topic, peopleData, relatedPeopleStatic]);

  const relatedCompanies = useMemo(() => {
    if (!topic) return [];
    return COMPANIES_DIRECTORY.filter(c => {
      const text = `${c.details.industry} ${c.description}`;
      return matchesKeywords(text, topic.companyKeywords);
    }).slice(0, 8);
  }, [topic]);

  const relatedTopics = useMemo(() => {
    if (!topic) return [];
    return TOPICS.filter(t => t.slug !== topic.slug &&
      (t.peopleCategories.some(c => topic.peopleCategories.includes(c)) ||
       t.podcastKeywords.some(kw => topic.podcastKeywords.some(tk => tk === kw)))
    ).slice(0, 6);
  }, [topic]);

  if (!topic) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-lg text-muted-foreground">Topic not found</p>
        <Link href="/topics" className="text-primary hover:underline">Browse all topics</Link>
      </div>
    );
  }

  const Icon = ICON_MAP[topic.icon] || Sparkles;

  const getPersonImage = (slug: string) => {
    const person = PEOPLE_DIRECTORY.find(p => p.slug === slug);
    return person?.imageUrl || "";
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead name={topic.name} description={topic.description} />

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

      <main className="max-w-6xl mx-auto px-6 pt-8 pb-20">
        <Link href="/topics" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6" data-testid="link-back-topics">
          <ArrowLeft className="w-3.5 h-3.5" />
          All Topics
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <div className="flex items-start gap-4 mb-4">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${topic.color} flex items-center justify-center flex-shrink-0`}>
              <Icon className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground" data-testid="text-topic-title">
                {topic.name}
              </h1>
              <p className="text-base text-muted-foreground mt-2 max-w-2xl" data-testid="text-topic-description">
                {topic.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-6">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 text-sm text-muted-foreground">
              <Headphones className="w-3.5 h-3.5" />
              <span data-testid="text-podcast-count">{relatedPodcasts.length} podcasts</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 text-sm text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              <span data-testid="text-people-count">{relatedPeople.length} people</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 text-sm text-muted-foreground">
              <Building2 className="w-3.5 h-3.5" />
              <span data-testid="text-company-count">{relatedCompanies.length} companies</span>
            </div>
          </div>
        </motion.div>

        {relatedPodcasts.length > 0 && (
          <section className="mb-14">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-display font-bold text-foreground" data-testid="heading-podcasts">
                Podcasts
              </h2>
              <Link href="/podcasts" className="text-sm text-primary hover:underline flex items-center gap-1" data-testid="link-all-podcasts">
                All podcasts <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {relatedPodcasts.map((podcast, i) => (
                <motion.div
                  key={podcast.slug}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <Link href={`/podcasts/${podcast.slug}`} data-testid={`card-podcast-${podcast.slug}`}>
                    <div className="group bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-3.5 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                      <div className="flex items-center gap-3">
                        <img
                          src={podcast.artworkUrl}
                          alt={podcast.name}
                          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                            {podcast.name}
                          </h3>
                          <p className="text-xs text-muted-foreground/60 truncate">{podcast.hosts}</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {relatedPeople.length > 0 && (
          <section className="mb-14">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-display font-bold text-foreground" data-testid="heading-people">
                People
              </h2>
              <Link href="/people" className="text-sm text-primary hover:underline flex items-center gap-1" data-testid="link-all-people">
                All people <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {relatedPeople.map((person, i) => {
                const personData = PEOPLE_DIRECTORY.find(p => p.slug === person.slug);
                return (
                  <motion.div
                    key={person.slug}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
                  >
                    <Link href={`/people/${person.slug}`} data-testid={`card-person-${person.slug}`}>
                      <div className="group bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-4 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                        <div className="flex items-center gap-3">
                          <img
                            src={getPersonImage(person.slug)}
                            alt={person.name}
                            className="w-10 h-10 rounded-full object-cover flex-shrink-0 bg-muted"
                            loading="lazy"
                          />
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                              {person.name}
                            </h3>
                            <p className="text-xs text-muted-foreground/60 truncate">{person.title}</p>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground/50 flex-shrink-0">
                            {person.guestCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Mic className="w-3 h-3" />
                                {person.guestCount}
                              </span>
                            )}
                            {person.mentionCount > 0 && (
                              <span className="flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                {person.mentionCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}

        {relatedCompanies.length > 0 && (
          <section className="mb-14">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-display font-bold text-foreground" data-testid="heading-companies">
                Companies
              </h2>
              <Link href="/companies" className="text-sm text-primary hover:underline flex items-center gap-1" data-testid="link-all-companies">
                All companies <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {relatedCompanies.map((company, i) => (
                <motion.div
                  key={company.slug}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <Link href={`/companies/${company.slug}`} data-testid={`card-company-${company.slug}`}>
                    <div className="group bg-card border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-4 hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                      <div className="flex items-center gap-3">
                        <img
                          src={company.logoUrl}
                          alt={company.name}
                          className="w-8 h-8 rounded-lg object-contain flex-shrink-0 bg-muted p-0.5"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                            {company.name}
                          </h3>
                          <p className="text-xs text-muted-foreground/60 truncate">{company.details.industry}</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {relatedTopics.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-display font-bold text-foreground mb-5" data-testid="heading-related-topics">
              Related Topics
            </h2>
            <div className="flex flex-wrap gap-2">
              {relatedTopics.map(t => {
                const TIcon = ICON_MAP[t.icon] || Sparkles;
                return (
                  <Link key={t.slug} href={`/topics/${t.slug}`} data-testid={`link-related-topic-${t.slug}`}>
                    <div className="group flex items-center gap-2 px-4 py-2.5 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-card hover:border-primary/20 hover:shadow-sm transition-all cursor-pointer">
                      <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${t.color} flex items-center justify-center`}>
                        <TIcon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{t.name}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
