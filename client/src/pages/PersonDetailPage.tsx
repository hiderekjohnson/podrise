import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Mic, MessageSquare, Headphones, Calendar, ExternalLink, Globe, Building2, Users, Zap, Tag, Quote, ChevronDown, ChevronUp, Clock, Radio, Search, ArrowUpDown } from "lucide-react";
import { SiX, SiLinkedin, SiInstagram } from "react-icons/si";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import { getPersonBySlug, getCompanyBySlug, PEOPLE_DIRECTORY, COMPANIES_DIRECTORY } from "@/data/entityDirectoryData";
import { TOPICS } from "@/data/topicData";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

interface EpisodeEntry {
  slug: string;
  episode_slug: string;
  podcast_name: string;
  episode_title: string;
  publish_date: string;
  artwork_url: string;
  context?: string;
  tldl?: string;
  type?: "guest" | "mention";
  hasTranscript?: boolean;
  relevanceScore?: number;
}

interface TopicEntry {
  topic: string;
  count: number;
  slug: string;
}

interface PodcastFeature {
  name: string;
  count: number;
  artwork_url: string;
  latestDate: string;
  latestTitle: string;
  latestEpisodeSlug: string;
  podcastSlug: string;
}

interface QuoteEntry {
  text: string;
  podcastName: string;
  episodeTitle: string;
  date: string;
  slug: string;
  episodeSlug: string;
  isFromGuestEpisode?: boolean;
}

interface PersonDetail {
  name: string;
  title: string;
  slug: string;
  guestAppearances: EpisodeEntry[];
  mentions: EpisodeEntry[];
  guestCount: number;
  mentionCount: number;
  topTopics: TopicEntry[];
  podcastsFeaturingPerson: PodcastFeature[];
  quotes: QuoteEntry[];
}

const EXISTING_TOPIC_SLUGS = new Set(TOPICS.map(t => t.slug));
const EXISTING_TOPIC_NAMES = new Map(TOPICS.map(t => [t.slug, t.name]));
const EXISTING_COMPANY_SLUGS = new Set(COMPANIES_DIRECTORY.map(c => c.slug));
const EXISTING_PEOPLE_SLUGS = new Set(PEOPLE_DIRECTORY.map(p => p.slug));

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function EpisodeCard({ episode, showType }: { episode: EpisodeEntry; showType?: boolean }) {
  const date = episode.publish_date ? new Date(episode.publish_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const isGuest = episode.type === "guest";

  return (
    <div className="p-4 sm:p-5 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-sm transition-all group" data-testid={`card-episode-${episode.slug}-${episode.episode_slug}`}>
      <div className="flex items-start gap-4">
        {episode.artwork_url && (
          <img src={episode.artwork_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/podcasts/${episode.slug}/${episode.episode_slug}`} className="text-[15px] font-semibold text-foreground hover:text-primary transition-colors leading-snug" data-testid={`link-episode-${episode.slug}-${episode.episode_slug}`}>
              {episode.episode_title}
            </Link>
            {showType && (
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium flex-shrink-0 mt-0.5 ${isGuest ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                {isGuest ? "Guest" : "Mentioned"}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
            <Link href={`/podcasts/${episode.slug}`} className="hover:text-foreground transition-colors flex items-center gap-1">
              <Headphones className="w-3.5 h-3.5" />
              {episode.podcast_name}
            </Link>
            {date && (
              <>
                <span className="mx-0.5">&middot;</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {date}
                </span>
              </>
            )}
          </p>
          {episode.context && (
            <p className="mt-2 text-sm text-muted-foreground/80 leading-relaxed italic">
              &ldquo;{episode.context}&rdquo;
            </p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs">
            <Link href={`/podcasts/${episode.slug}/${episode.episode_slug}`} className="text-primary hover:text-primary/80 font-medium transition-colors" data-testid={`link-recap-${episode.slug}-${episode.episode_slug}`}>
              Read Recap
            </Link>
            {episode.hasTranscript && (
              <Link href={`/podcasts/${episode.slug}/${episode.episode_slug}/transcript`} className="text-muted-foreground hover:text-foreground font-medium transition-colors" data-testid={`link-transcript-${episode.slug}-${episode.episode_slug}`}>
                View Transcript
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PersonDetailPage() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/people/:slug");
  const slug = params?.slug || "";
  const { data: user } = useAuth();
  const personData = getPersonBySlug(slug);

  const [sortOrder, setSortOrder] = useState<"relevance" | "newest" | "oldest">("relevance");
  const [filterText, setFilterText] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "guests" | "mentions">("all");
  const [faqOpen, setFaqOpen] = useState<Record<number, boolean>>({});

  const { data: person, isLoading } = useQuery<PersonDetail>({
    queryKey: ["/api/entities/people", slug],
    queryFn: async () => {
      const res = await fetch(`/api/entities/people/${slug}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!slug,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  const hasGuestAppearances = (person?.guestCount || 0) > 0;
  const totalEpisodes = (person?.guestCount || 0) + (person?.mentionCount || 0);

  const pageTitle = person
    ? hasGuestAppearances
      ? `${person.name} Podcast Appearances, Interviews, and Mentions`
      : `${person.name} Podcast Mentions, Discussions, and Episode Recaps`
    : "";

  const pageDescription = person
    ? hasGuestAppearances
      ? `Explore ${person.name} podcast appearances, interviews, mentions, and episode recaps across top business, technology, and AI podcasts.`
      : `Explore podcast episodes discussing ${person.name}, including mentions, recaps, and key themes across top business, technology, and AI podcasts.`
    : "";

  useEffect(() => {
    if (!person) return;
    document.title = `${pageTitle} | PodCap`;
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
    setOrCreate('meta[name="description"]', "name", pageDescription);
    setOrCreate('meta[property="og:title"]', "property", `${pageTitle} | PodCap`);
    setOrCreate('meta[property="og:description"]', "property", pageDescription);
    setOrCreate('meta[property="og:type"]', "property", "profile");

    let schemaScript = document.getElementById("person-schema") as HTMLScriptElement | null;
    if (!schemaScript) {
      schemaScript = document.createElement("script");
      schemaScript.id = "person-schema";
      schemaScript.type = "application/ld+json";
      document.head.appendChild(schemaScript);
    }
    const socialLinks = personData?.socialLinks;
    const sameAs = [socialLinks?.twitter, socialLinks?.linkedin, socialLinks?.instagram, socialLinks?.website].filter(Boolean);
    const personSchema: any = {
      "@context": "https://schema.org",
      "@type": "Person",
      name: person.name,
      jobTitle: person.title,
      url: `https://podcap.io/people/${slug}`,
      description: pageDescription,
    };
    if (personData?.imageUrl) personSchema.image = `https://podcap.io${personData.imageUrl}`;
    if (sameAs.length > 0) personSchema.sameAs = sameAs;
    schemaScript.textContent = JSON.stringify(personSchema);

    let breadcrumbScript = document.getElementById("breadcrumb-schema") as HTMLScriptElement | null;
    if (!breadcrumbScript) {
      breadcrumbScript = document.createElement("script");
      breadcrumbScript.id = "breadcrumb-schema";
      breadcrumbScript.type = "application/ld+json";
      document.head.appendChild(breadcrumbScript);
    }
    breadcrumbScript.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://podcap.io/" },
        { "@type": "ListItem", position: 2, name: "People", item: "https://podcap.io/people" },
        { "@type": "ListItem", position: 3, name: person.name, item: `https://podcap.io/people/${slug}` },
      ],
    });

    return () => {
      document.getElementById("person-schema")?.remove();
      document.getElementById("breadcrumb-schema")?.remove();
    };
  }, [person, personData, slug, pageTitle, pageDescription]);

  const socialLinks = personData?.socialLinks;

  const allEpisodes = useMemo(() => {
    if (!person) return [];
    return [...person.guestAppearances, ...person.mentions];
  }, [person]);

  const filteredEpisodes = useMemo(() => {
    return allEpisodes
      .filter(ep => {
        if (activeTab === "guests" && ep.type !== "guest") return false;
        if (activeTab === "mentions" && ep.type !== "mention") return false;
        if (filterText) {
          const q = filterText.toLowerCase();
          return ep.episode_title.toLowerCase().includes(q) || ep.podcast_name.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (sortOrder === "relevance") {
          const scoreA = a.relevanceScore || 10;
          const scoreB = b.relevanceScore || 10;
          if (scoreB !== scoreA) return scoreB - scoreA;
          return (b.publish_date || "").localeCompare(a.publish_date || "");
        }
        if (!a.publish_date || !b.publish_date) return 0;
        return sortOrder === "newest" ? b.publish_date.localeCompare(a.publish_date) : a.publish_date.localeCompare(b.publish_date);
      });
  }, [allEpisodes, activeTab, filterText, sortOrder]);

  const broadTopics = useMemo(() => {
    if (!person?.topTopics) return [];
    return person.topTopics.filter(t => EXISTING_TOPIC_SLUGS.has(t.slug));
  }, [person]);

  const keyIdeas = useMemo(() => {
    if (!person || broadTopics.length === 0) return [];
    return broadTopics.slice(0, 6).map(topic => {
      const relatedEps = allEpisodes.filter(ep => {
        const combined = `${ep.episode_title} ${ep.context || ""} ${ep.tldl || ""}`.toLowerCase();
        return combined.includes(topic.topic.toLowerCase());
      }).slice(0, 3);
      return { ...topic, relatedEps, topicPageSlug: topic.slug };
    }).filter(t => t.relatedEps.length > 0);
  }, [person, broadTopics, allEpisodes]);

  const guestQuotes = useMemo(() => {
    if (!person?.quotes) return [];
    return person.quotes.filter(q => q.isFromGuestEpisode);
  }, [person]);

  const mentionQuotes = useMemo(() => {
    if (!person?.quotes) return [];
    return person.quotes.filter(q => !q.isFromGuestEpisode);
  }, [person]);

  const displayQuotes = guestQuotes.length >= 2 ? guestQuotes : mentionQuotes.length >= 2 ? mentionQuotes : [];
  const showQuotesSection = displayQuotes.length >= 2;
  const quoteSectionTitle = displayQuotes.length > 0 && displayQuotes[0]?.isFromGuestEpisode
    ? `Notable Quotes From ${person?.name || ""} Podcast Appearances`
    : `Notable Podcast Mentions of ${person?.name || ""}`;

  const timelineByYear = useMemo(() => {
    if (!person) return {};
    const all = [...person.guestAppearances, ...person.mentions]
      .filter(e => e.publish_date)
      .sort((a, b) => b.publish_date.localeCompare(a.publish_date));
    const grouped: Record<string, EpisodeEntry[]> = {};
    for (const ep of all) {
      const year = new Date(ep.publish_date).getFullYear().toString();
      if (!grouped[year]) grouped[year] = [];
      if (grouped[year].length < 5) grouped[year].push(ep);
    }
    return grouped;
  }, [person]);

  const faqItems = useMemo(() => {
    if (!person) return [];
    const items: { q: string; a: string }[] = [];
    const podcastNames = (person.podcastsFeaturingPerson || []).map(p => p.name);

    if (hasGuestAppearances) {
      items.push({
        q: `What podcasts has ${person.name} appeared on?`,
        a: `PodCap tracks ${totalEpisodes} podcast episode${totalEpisodes !== 1 ? "s" : ""} related to ${person.name}, including ${person.guestCount} direct guest appearance${person.guestCount !== 1 ? "s" : ""} and ${person.mentionCount} mention${person.mentionCount !== 1 ? "s" : ""}. Featured podcasts include ${podcastNames.slice(0, 5).join(", ")}${podcastNames.length > 5 ? `, and ${podcastNames.length - 5} more` : ""}. On this page, you can browse the latest related episodes, recaps, and transcripts where available.`
      });
    } else {
      items.push({
        q: `What podcasts discuss ${person.name}?`,
        a: `PodCap tracks ${totalEpisodes} podcast episode${totalEpisodes !== 1 ? "s" : ""} that discuss or mention ${person.name} across ${podcastNames.length} podcast${podcastNames.length !== 1 ? "s" : ""}, including ${podcastNames.slice(0, 5).join(", ")}${podcastNames.length > 5 ? `, and ${podcastNames.length - 5} more` : ""}. Browse episode recaps, key themes, and transcripts where available on this page.`
      });
    }

    if (broadTopics.length > 0) {
      const topicNames = broadTopics.slice(0, 5).map(t => t.topic);
      items.push({
        q: `What topics are associated with ${person.name} on podcasts?`,
        a: `Across podcast episodes, ${person.name} is frequently associated with topics like ${topicNames.join(", ")}. These themes emerge from episode recaps and transcripts tracked by PodCap. Explore individual episode recaps for detailed coverage of each topic.`
      });
    }

    if (podcastNames.length > 0) {
      const topPodcast = person.podcastsFeaturingPerson[0];
      items.push({
        q: `Which podcast features ${person.name} the most?`,
        a: `${topPodcast.name} has the most episodes related to ${person.name}, with ${topPodcast.count} episode${topPodcast.count !== 1 ? "s" : ""}. The most recent episode is "${topPodcast.latestTitle}." Browse all related episodes and recaps on this page.`
      });
    }

    const relatedCompanies = personData?.relatedCompanies?.map(s => getCompanyBySlug(s)?.name).filter(Boolean) || [];
    if (relatedCompanies.length > 0) {
      items.push({
        q: `What companies is ${person.name} associated with?`,
        a: `${person.name} is associated with ${relatedCompanies.join(", ")}. These connections are tracked across podcast conversations on PodCap. Explore company pages and related episodes for deeper coverage of each organization.`
      });
    }

    items.push({
      q: `Can I read transcripts of ${person.name} podcast episodes?`,
      a: `Yes, PodCap provides full transcripts for many episodes. Look for the "View Transcript" link on individual episode cards. Transcripts are available for most recent episodes and are being added continuously.`
    });

    return items;
  }, [person, personData, broadTopics, hasGuestAppearances, totalEpisodes]);

  useEffect(() => {
    if (faqItems.length === 0) return;
    let faqScript = document.getElementById("faq-schema") as HTMLScriptElement | null;
    if (!faqScript) {
      faqScript = document.createElement("script");
      faqScript.id = "faq-schema";
      faqScript.type = "application/ld+json";
      document.head.appendChild(faqScript);
    }
    faqScript.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map(item => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });
    return () => { document.getElementById("faq-schema")?.remove(); };
  }, [faqItems]);

  const showTopicsSection = broadTopics.length >= 3;
  const showTimelineSection = Object.keys(timelineByYear).length >= 2;
  const showPodcastsSection = (person?.podcastsFeaturingPerson || []).length >= 2;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link href="/" className="flex items-center" data-testid="link-home">
          <img src={logoPath} alt="PodCap" className="h-9 object-contain" />
        </Link>
        <div className="flex items-center gap-4">
          {user ? (
            <Link href="/dashboard" className="text-base font-medium text-primary hover:text-primary/80 transition-colors" data-testid="link-dashboard">Dashboard</Link>
          ) : (
            <>
              <Link href="/get-started" className="flex items-center gap-1.5 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-xs font-semibold text-primary tracking-wide uppercase hover:bg-primary/15 transition-colors" data-testid="link-nav-get-started">
                <Zap className="w-3.5 h-3.5" />
                Build Your Recap
              </Link>
              <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-login">Log in</Link>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20">
        <div className="w-full max-w-3xl">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6 mt-2" data-testid="breadcrumb">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <span>/</span>
            <Link href="/people" className="hover:text-foreground transition-colors">People</Link>
            <span>/</span>
            <span className="text-foreground font-medium">{personData?.name || slug}</span>
          </nav>

          {isLoading ? (
            <div className="space-y-4">
              <div className="flex items-center gap-6">
                <div className="w-28 h-28 rounded-full bg-muted animate-pulse" />
                <div className="flex-1">
                  <div className="h-10 bg-muted rounded w-64 animate-pulse mb-3" />
                  <div className="h-5 bg-muted rounded w-96 animate-pulse" />
                </div>
              </div>
              <div className="h-64 bg-muted rounded animate-pulse mt-8" />
            </div>
          ) : person ? (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>

              {/* 1. Hero Section */}
              <section className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-8" data-testid="section-hero">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                  <div className="flex-shrink-0">
                    <img
                      src={personData?.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(person.name)}&size=120&background=1a8cff&color=fff&bold=true`}
                      alt={person.name}
                      className="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover border-4 border-border shadow-lg"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(person.name)}&size=120&background=1a8cff&color=fff&bold=true`;
                      }}
                      data-testid="img-person-avatar"
                    />
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em] mb-1" data-testid="heading-person-name">
                      {pageTitle}
                    </h1>
                    <p className="text-base text-muted-foreground mb-3">{person.title}</p>

                    <p className="text-[15px] text-muted-foreground/80 leading-relaxed mb-4" data-testid="text-person-intro">
                      {personData?.bio
                        ? personData.bio
                        : hasGuestAppearances
                          ? `Discover podcast interviews, guest appearances, and mentions featuring ${person.name} across top business, technology, and AI podcasts.`
                          : `Explore podcast episodes discussing ${person.name}, including key themes, recaps, and transcripts across top business, technology, and AI podcasts.`}
                    </p>

                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mb-4">
                      {socialLinks?.twitter && (
                        <a href={socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-full" data-testid="link-twitter">
                          <SiX className="w-3.5 h-3.5" /> X / Twitter
                        </a>
                      )}
                      {socialLinks?.linkedin && (
                        <a href={socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-full" data-testid="link-linkedin">
                          <SiLinkedin className="w-3.5 h-3.5" /> LinkedIn
                        </a>
                      )}
                      {socialLinks?.instagram && (
                        <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-full" data-testid="link-instagram">
                          <SiInstagram className="w-3.5 h-3.5" /> Instagram
                        </a>
                      )}
                      {socialLinks?.website && (
                        <a href={socialLinks.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-full" data-testid="link-website">
                          <Globe className="w-3.5 h-3.5" /> Website
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-4 justify-center sm:justify-start">
                      {hasGuestAppearances && (
                        <button onClick={() => scrollToSection("section-appearances")} className="flex items-center gap-1.5 text-sm hover:text-primary transition-colors cursor-pointer" data-testid="jump-guests">
                          <Mic className="w-4 h-4 text-primary" />
                          <span className="font-semibold text-foreground">{person.guestCount}</span>
                          <span className="text-muted-foreground">guest appearance{person.guestCount !== 1 ? "s" : ""}</span>
                        </button>
                      )}
                      <button onClick={() => scrollToSection("section-appearances")} className="flex items-center gap-1.5 text-sm hover:text-primary transition-colors cursor-pointer" data-testid="jump-mentions">
                        <MessageSquare className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-foreground">{person.mentionCount}</span>
                        <span className="text-muted-foreground">mention{person.mentionCount !== 1 ? "s" : ""}</span>
                      </button>
                    </div>

                    {personData?.relatedCompanies && personData.relatedCompanies.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-border" data-testid="section-related-companies">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Related Companies</p>
                        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                          {personData.relatedCompanies.map((companySlug) => {
                            if (!EXISTING_COMPANY_SLUGS.has(companySlug)) return null;
                            const c = getCompanyBySlug(companySlug);
                            if (!c) return null;
                            return (
                              <Link key={companySlug} href={`/companies/${companySlug}`} className="flex items-center gap-2 bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-full transition-colors group" data-testid={`chip-company-${companySlug}`}>
                                <img src={c.logoUrl} alt={c.name} className="w-5 h-5 rounded object-contain" onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&size=20&background=1a8cff&color=fff&bold=true`; }} />
                                <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{c.name}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {personData?.similarPeople && personData.similarPeople.length > 0 && (
                      <div className={`mt-4 ${personData?.relatedCompanies?.length ? "" : "pt-4 border-t border-border"}`} data-testid="section-similar-people">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Similar People</p>
                        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                          {personData.similarPeople.map((personSlug) => {
                            if (!EXISTING_PEOPLE_SLUGS.has(personSlug)) return null;
                            const p = PEOPLE_DIRECTORY.find(x => x.slug === personSlug);
                            if (!p) return null;
                            return (
                              <Link key={personSlug} href={`/people/${personSlug}`} className="flex items-center gap-2 bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-full transition-colors group" data-testid={`chip-person-${personSlug}`}>
                                <img src={p.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&size=20&background=1a8cff&color=fff&bold=true`} alt={p.name} className="w-5 h-5 rounded-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&size=20&background=1a8cff&color=fff&bold=true`; }} />
                                <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{p.name}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* 2. Key Ideas Section */}
              {keyIdeas.length >= 2 && (
                <section className="mb-8" data-testid="section-key-ideas">
                  <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                    <Tag className="w-5 h-5 text-primary" />
                    Key Ideas {person.name} {hasGuestAppearances ? "Discusses" : "Is Discussed About"} on Podcasts
                  </h2>
                  <div className="space-y-4">
                    {keyIdeas.map((idea, i) => (
                      <div key={i} className="bg-card border border-border rounded-xl p-5" data-testid={`key-idea-${i}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-base font-semibold text-foreground">{idea.topic}</h3>
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{idea.count} episode{idea.count !== 1 ? "s" : ""}</span>
                          <Link href={`/topics/${idea.topicPageSlug}`} className="text-xs text-primary hover:text-primary/80 font-medium transition-colors ml-auto" data-testid={`link-topic-${idea.topicPageSlug}`}>
                            Explore Topic &rarr;
                          </Link>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                          {hasGuestAppearances
                            ? `${person.name} discusses ${idea.topic.toLowerCase()} across ${idea.count} podcast episode${idea.count !== 1 ? "s" : ""}. Explore the full recaps for in-depth coverage of this theme.`
                            : `${person.name} is discussed in the context of ${idea.topic.toLowerCase()} across ${idea.count} episode${idea.count !== 1 ? "s" : ""}. Explore recaps for detailed coverage.`}
                        </p>
                        {idea.relatedEps.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            {idea.relatedEps.map((ep, j) => (
                              <Link key={j} href={`/podcasts/${ep.slug}/${ep.episode_slug}`} className="text-sm text-primary/80 hover:text-primary transition-colors flex items-center gap-1.5" data-testid={`key-idea-ep-${i}-${j}`}>
                                <Headphones className="w-3 h-3" />
                                {ep.episode_title}
                                <span className="text-muted-foreground text-xs">— {ep.podcast_name}</span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 3. Notable Quotes / Mentions Section */}
              {showQuotesSection && (
                <section className="mb-8" data-testid="section-quotes">
                  <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                    <Quote className="w-5 h-5 text-primary" />
                    {quoteSectionTitle}
                  </h2>
                  <div className="space-y-3">
                    {displayQuotes.map((quote, i) => {
                      const date = quote.date ? new Date(quote.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
                      return (
                        <div key={i} className="bg-card border border-border rounded-xl p-5" data-testid={`quote-${i}`}>
                          <blockquote className="text-[15px] text-foreground leading-relaxed italic mb-3">
                            &ldquo;{quote.text}&rdquo;
                          </blockquote>
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                              <Headphones className="w-3.5 h-3.5" />
                              <span>{quote.podcastName}</span>
                              {date && <><span>&middot;</span><span>{date}</span></>}
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <Link href={`/podcasts/${quote.slug}/${quote.episodeSlug}`} className="text-primary hover:text-primary/80 font-medium transition-colors" data-testid={`link-quote-recap-${i}`}>
                                Read Recap
                              </Link>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 truncate">{quote.episodeTitle}</p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* 4. FAQ Section */}
              {faqItems.length > 0 && (
                <section className="mb-8" data-testid="section-faq">
                  <h2 className="text-xl font-bold text-foreground mb-4">
                    Frequently Asked Questions About {person.name} on Podcasts
                  </h2>
                  <div className="space-y-2">
                    {faqItems.map((item, i) => (
                      <div key={i} className="bg-card border border-border rounded-xl overflow-hidden" data-testid={`faq-${i}`}>
                        <button
                          onClick={() => setFaqOpen(prev => ({ ...prev, [i]: !prev[i] }))}
                          className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
                          data-testid={`faq-toggle-${i}`}
                        >
                          <span className="text-[15px] font-semibold text-foreground pr-4">{item.q}</span>
                          {faqOpen[i] ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                        </button>
                        {faqOpen[i] && (
                          <div className="px-4 pb-4" data-testid={`faq-answer-${i}`}>
                            <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 5. All Appearances & Mentions */}
              <section id="section-appearances" className="mb-8" data-testid="section-appearances">
                <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                  <Mic className="w-5 h-5 text-primary" />
                  All {hasGuestAppearances ? "Appearances & " : ""}Mentions
                </h2>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
                  <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl flex-shrink-0" data-testid="tabs-episode-type">
                    {(["all", "guests", "mentions"] as const).map(tab => {
                      if (tab === "guests" && !hasGuestAppearances) return null;
                      return (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                          data-testid={`tab-${tab}`}
                        >
                          {tab === "all" ? "All" : tab === "guests" ? "Guest" : "Mentions"}
                          <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${activeTab === tab ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {tab === "all" ? totalEpisodes : tab === "guests" ? person.guestCount : person.mentionCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Filter episodes..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30"
                        data-testid="input-filter-episodes"
                      />
                    </div>
                    <button
                      onClick={() => setSortOrder(o => o === "relevance" ? "newest" : o === "newest" ? "oldest" : "relevance")}
                      className="flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground bg-muted/50 border border-border rounded-lg transition-colors flex-shrink-0"
                      data-testid="button-sort"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      {sortOrder === "relevance" ? "Top" : sortOrder === "newest" ? "Newest" : "Oldest"}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {filteredEpisodes.length > 0 ? (
                    filteredEpisodes.map((ep) => (
                      <EpisodeCard key={`${ep.slug}/${ep.episode_slug}`} episode={ep} showType />
                    ))
                  ) : (
                    <p className="text-center py-8 text-muted-foreground text-sm">No episodes match your filters.</p>
                  )}
                </div>
              </section>

              {/* 6. Podcasts Featuring This Person */}
              {showPodcastsSection && (
                <section className="mb-8" data-testid="section-podcasts-featuring">
                  <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                    <Radio className="w-5 h-5 text-primary" />
                    Podcasts Featuring {person.name}
                  </h2>
                  <div className="grid gap-3">
                    {person.podcastsFeaturingPerson.map((podcast, i) => {
                      const latestDate = podcast.latestDate ? new Date(podcast.latestDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
                      return (
                        <Link key={i} href={`/podcasts/${podcast.podcastSlug}`} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:border-primary/30 hover:shadow-sm transition-all group" data-testid={`podcast-featuring-${i}`}>
                          {podcast.artwork_url && (
                            <img src={podcast.artwork_url} alt={podcast.name} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors" data-testid={`link-podcast-${podcast.podcastSlug}`}>
                              {podcast.name}
                            </p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {podcast.count} episode{podcast.count !== 1 ? "s" : ""} {latestDate && <>&middot; Latest: {latestDate}</>}
                            </p>
                            <p className="text-xs text-muted-foreground/70 mt-1 truncate">
                              {podcast.latestTitle}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* 7. Related People */}
              {personData?.similarPeople && personData.similarPeople.filter(s => EXISTING_PEOPLE_SLUGS.has(s)).length > 0 && (
                <section className="mb-8" data-testid="section-related-people">
                  <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    People Often Mentioned With {person.name}
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {personData.similarPeople.filter(s => EXISTING_PEOPLE_SLUGS.has(s)).map((personSlug) => {
                      const p = PEOPLE_DIRECTORY.find(x => x.slug === personSlug);
                      if (!p) return null;
                      return (
                        <Link key={personSlug} href={`/people/${personSlug}`} className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 hover:border-primary/30 transition-all group" data-testid={`related-person-${personSlug}`}>
                          <img src={p.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&size=40&background=1a8cff&color=fff&bold=true`} alt={p.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&size=40&background=1a8cff&color=fff&bold=true`; }} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">{p.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{p.title}</p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* 8. Timeline */}
              {showTimelineSection && (
                <section className="mb-8" data-testid="section-timeline">
                  <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    Timeline
                  </h2>
                  <div className="space-y-6">
                    {Object.entries(timelineByYear).map(([year, episodes]) => (
                      <div key={year} data-testid={`timeline-year-${year}`}>
                        <h3 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                          <span className="w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center">{year}</span>
                        </h3>
                        <div className="border-l-2 border-border pl-5 ml-4 space-y-3">
                          {episodes.map((ep, i) => {
                            const date = ep.publish_date ? new Date(ep.publish_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                            return (
                              <div key={i} className="relative" data-testid={`timeline-item-${year}-${i}`}>
                                <div className="absolute -left-[1.625rem] top-1.5 w-3 h-3 rounded-full bg-border border-2 border-background" />
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <Link href={`/podcasts/${ep.slug}/${ep.episode_slug}`} className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                                      {ep.episode_title}
                                    </Link>
                                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                                      <Link href={`/podcasts/${ep.slug}`} className="hover:text-foreground transition-colors">{ep.podcast_name}</Link>
                                      {date && <><span>&middot;</span><span>{date}</span></>}
                                      <span>&middot;</span>
                                      <span className={ep.type === "guest" ? "text-primary font-medium" : ""}>{ep.type === "guest" ? "Guest" : "Mentioned"}</span>
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 9. Topics - only if quality is high (broad, existing topic pages) */}
              {showTopicsSection && (
                <section className="mb-8" data-testid="section-associated-topics">
                  <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                    <Tag className="w-5 h-5 text-primary" />
                    Topics Associated With {person.name}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {broadTopics.map((topic, i) => (
                      <Link key={i} href={`/topics/${topic.slug}`} className="flex items-center gap-1.5 bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-full transition-colors group" data-testid={`chip-topic-${topic.slug}`}>
                        <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{topic.topic}</span>
                        <span className="text-xs text-muted-foreground">{topic.count}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

            </motion.div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg">Person not found.</p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}