import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, MessageSquare, Headphones, Calendar, ExternalLink, Building2, Globe, MapPin, Users, DollarSign, Briefcase, Clock, Zap } from "lucide-react";
import { PodcastMicBadge } from "@/components/PodcastMicBadge";
import { Footer } from "@/components/Footer";
import { getCompanyBySlug, getPersonBySlug as getPersonData, COMPANIES_DIRECTORY, PEOPLE_DIRECTORY } from "@/data/entityDirectoryData";
import { SiteHeader } from "@/components/SiteHeader";
import { FeedStyleCard, FeedStyleCardHeader } from "@/components/FeedStyleCard";
import { RecapCard } from "@/components/RecapCard";
import { PODCAST_LANDINGS } from "@/data/podcastLandingData";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EpisodeEntry {
  slug: string;
  episode_slug: string;
  podcast_name: string;
  episode_title: string;
  publish_date: string;
  artwork_url: string;
  context?: string;
}

interface CompanyDetail {
  name: string;
  description: string;
  slug: string;
  mentions: EpisodeEntry[];
  mentionCount: number;
}

export default function CompanyDetailPage() {
  const { data: authUser } = useAuth();
  const isLoggedIn = !!authUser;
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/companies/:slug");
  const slug = params?.slug || "";
  const companyData = getCompanyBySlug(slug);
  const [activeSection, setActiveSection] = useState("");
  const [showAllEpisodes, setShowAllEpisodes] = useState(false);
  const { toast } = useToast();

  type BookmarkRecord = { id: number; episodeSlug: string; podcastSlug: string };
  const { data: bookmarksData } = useQuery<BookmarkRecord[]>({
    queryKey: ["/api/bookmarks"],
    enabled: isLoggedIn,
  });
  const bookmarkedKeys = new Set((bookmarksData || []).map((b: BookmarkRecord) => `${b.podcastSlug}::${b.episodeSlug}`));

  const { data: followData } = useQuery<{ followedSlugs: string[] }>({
    queryKey: ["/api/feed/followed-slugs"],
    enabled: isLoggedIn,
  });
  const followedSlugs = new Set(followData?.followedSlugs || []);

  const addBookmark = useMutation({
    mutationFn: async ({ episodeSlug, podcastSlug }: { episodeSlug: string; podcastSlug: string }) => {
      await apiRequest("POST", "/api/bookmarks", { episodeSlug, podcastSlug });
    },
    onSuccess: () => { toast({ title: "Saved", description: "Episode saved" }); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] }); },
  });

  const removeBookmark = useMutation({
    mutationFn: async ({ podcastSlug, episodeSlug }: { podcastSlug: string; episodeSlug: string }) => {
      await apiRequest("DELETE", `/api/bookmarks/${encodeURIComponent(podcastSlug)}/${encodeURIComponent(episodeSlug)}`);
    },
    onSuccess: () => { toast({ title: "Removed", description: "Episode removed from saved" }); },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] }); },
  });

  const handleBookmarkToggle = (episodeSlug: string, podcastSlug: string) => {
    if (!authUser) return;
    const key = `${podcastSlug}::${episodeSlug}`;
    if (bookmarkedKeys.has(key)) removeBookmark.mutate({ podcastSlug, episodeSlug });
    else addBookmark.mutate({ episodeSlug, podcastSlug });
  };

  const followMutation = useMutation({
    mutationFn: async ({ podcastSlug, follow }: { podcastSlug: string; follow: boolean }) => {
      const endpoint = follow ? "/api/feed/follow" : "/api/feed/unfollow";
      await apiRequest("POST", endpoint, { podcastSlug });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed/followed-slugs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
    },
  });

  const handleFollowToggle = (podcastSlug: string, follow: boolean) => {
    if (!authUser) return;
    followMutation.mutate({ podcastSlug, follow });
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    setShowAllEpisodes(false);
  }, [slug]);

  const { data: company, isLoading } = useQuery<CompanyDetail>({
    queryKey: ["/api/entities/companies", slug],
    queryFn: async () => {
      const res = await fetch(`/api/entities/companies/${slug}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!slug,
  });

  if (typeof document !== "undefined" && company) {
    const title = `${company.name} Podcast Mentions, Analysis & Trends | PodRise`;
    const desc = `What top podcasts say about ${company.name}. ${company.mentionCount} mentions across leading shows — explore episodes, trends, and key discussions.`;
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
    setOrCreate('meta[name="twitter:card"]', "name", "summary_large_image");
    setOrCreate('meta[name="twitter:title"]', "name", title);
    setOrCreate('meta[name="twitter:description"]', "name", desc);
  }

  const details = companyData?.details;
  const hasRelatedPeople = !!(companyData?.relatedPeople && companyData.relatedPeople.length > 0);
  const hasSimilarCompanies = !!(companyData?.similarCompanies && companyData.similarCompanies.length > 0);
  const hasAssociatedTerms = !!(companyData?.associatedTerms && companyData.associatedTerms.length > 0);
  const hasAboutContent = !!(details || companyData?.background || hasAssociatedTerms);
  const hasEpisodes = !!(company && company.mentions.length > 0);

  const navSections = useMemo(() => {
    if (!company) return [];
    const sections: { id: string; label: string }[] = [];
    if (hasAboutContent) sections.push({ id: "section-about", label: "About" });
    if (hasEpisodes) sections.push({ id: "section-episodes", label: "Episodes" });
    if (hasRelatedPeople) sections.push({ id: "section-related-people", label: "People" });
    if (hasSimilarCompanies) sections.push({ id: "section-similar-companies", label: "Similar" });
    return sections;
  }, [company, hasAboutContent, hasEpisodes, hasRelatedPeople, hasSimilarCompanies]);

  useEffect(() => {
    if (navSections.length === 0) return;
    const handleScroll = () => {
      const offset = 68 + 52 + 40;
      let current = navSections[0]?.id || "";
      for (const s of navSections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= offset) {
          current = s.id;
        }
      }
      setActiveSection(current);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [navSections]);

  const scrollToNav = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const offset = 68 + 52 + 16;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const companyMetaItems = [];
  if (company) {
    const podcastCount = new Set(company.mentions.map(m => m.slug)).size;
    if (podcastCount > 0) companyMetaItems.push({ icon: "episodes" as const, text: `${podcastCount} podcast${podcastCount !== 1 ? "s" : ""}` });
    if (company.mentionCount > 0) companyMetaItems.push({ icon: "mentions" as const, text: `${company.mentionCount} mentions` });
  }

  const navTopClass = isLoggedIn ? "top-0 bg-[#F9F9FB]/90" : "top-[68px] bg-background/90";

  const companyContent = company ? (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      {navSections.length > 1 && (
        <nav className={`sticky ${navTopClass} z-40 -mx-4 sm:-mx-0 px-4 sm:px-0 py-2.5 backdrop-blur-md border-b border-black/[0.06] dark:border-white/[0.06] flex items-center gap-2 overflow-x-auto hide-scrollbar mb-6`} data-testid="nav-in-page">
          {navSections.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollToNav(s.id)}
              className={`px-4 py-2.5 text-[16px] font-semibold min-h-[44px] rounded-lg whitespace-nowrap transition-colors ${activeSection === s.id ? "bg-primary/[0.12] text-primary" : "bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"}`}
              data-testid={`nav-${s.id}`}
            >
              {s.label}
            </button>
          ))}
        </nav>
      )}

      {hasAboutContent && (
        <section id="section-about" className="mb-8">
          <h2 className="text-lg font-display font-bold text-foreground mb-4 flex items-center gap-2" data-testid="heading-about">
            <Building2 className="w-5 h-5 text-primary" />
            About {company.name}
          </h2>
          <div className="bg-card border border-border rounded-xl p-5 sm:p-6">
            {companyData?.background && (
              <p className="text-base text-[#52525B] leading-relaxed mb-5" data-testid="text-company-background">
                {companyData.background}
              </p>
            )}

            {details && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="section-company-details">
                <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                  <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-base text-[#52525B] dark:text-[#A1A1AA]">Headquarters</p>
                    <p className="text-base font-medium text-foreground">{details.headquarters}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                  <Clock className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-base text-[#52525B] dark:text-[#A1A1AA]">Founded</p>
                    <p className="text-base font-medium text-foreground">{details.founded}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                  <Users className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-base text-[#52525B] dark:text-[#A1A1AA]">Employees</p>
                    <p className="text-base font-medium text-foreground">{details.employees}</p>
                  </div>
                </div>
                {details.marketCap && (
                  <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                    <DollarSign className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-base text-[#52525B] dark:text-[#A1A1AA]">Market Cap</p>
                      <p className="text-base font-medium text-foreground">{details.marketCap}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                  <Briefcase className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-base text-[#52525B] dark:text-[#A1A1AA]">CEO</p>
                    <p className="text-base font-medium text-foreground">{details.ceo}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                  <Building2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-base text-[#52525B] dark:text-[#A1A1AA]">Industry</p>
                    <p className="text-base font-medium text-foreground">{details.industry}</p>
                  </div>
                </div>
                {details.website && (
                  <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg col-span-2 sm:col-span-3">
                    <Globe className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-base text-[#52525B] dark:text-[#A1A1AA]">Website</p>
                      <a href={details.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-base font-medium text-primary hover:text-primary/80 transition-colors" data-testid="link-company-website">
                        {details.website.replace("https://", "")}
                        <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {companyData?.associatedTerms && companyData.associatedTerms.length > 0 && (
              <div className="mt-5 pt-4 border-t border-border" data-testid="section-associated-terms">
                <p className="text-[16px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Associated Terms</p>
                <div className="flex flex-wrap gap-2">
                  {companyData.associatedTerms.map((term) => (
                    <span key={term} className="px-3 py-1.5 bg-primary/10 text-primary text-base font-medium rounded-full" data-testid={`badge-term-${term.toLowerCase().replace(/\s+/g, '-')}`}>
                      {term}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {company.mentions.length > 0 ? (
        <section id="section-episodes" className="mb-10">
          <h2 className="text-lg font-display font-bold text-foreground mb-4 flex items-center gap-2" data-testid="heading-mentioned-episodes">
            <MessageSquare className="w-5 h-5 text-primary" />
            Episodes Mentioning {company.name}
          </h2>
          <div className={isLoggedIn ? "flex flex-col gap-4" : "space-y-2"}>
            {(showAllEpisodes ? company.mentions : company.mentions.slice(0, 8)).map((ep) => (
              isLoggedIn ? (
                (() => {
                  const podcastMeta = PODCAST_LANDINGS.find(p => p.slug === ep.slug);
                  return (
                    <RecapCard
                      key={`${ep.slug}/${ep.episode_slug}`}
                      id={ep.id || `${ep.slug}-${ep.episode_slug}`}
                      podcastSlug={ep.slug}
                      episodeSlug={ep.episode_slug}
                      podcastName={ep.podcast_name}
                      episodeTitle={ep.episode_title}
                      publishDate={ep.publish_date}
                      artworkUrl={ep.artwork_url}
                      tldl={ep.tldl}
                      tabloidSubHeadline={ep.tabloid_sub_headline}
                      keyInsights={ep.key_insights}
                      quote={ep.quote || ep.context}
                      quoteAttribution={ep.quote_attribution}
                      duration={ep.duration}
                      whatHappened={ep.what_happened}
                      spotifyEpisodeUrl={ep.spotify_episode_url}
                      spotifyUrl={ep.pdSpotifyUrl}
                      youtubeUrl={ep.youtube_url || ep.pdYoutubeUrl}
                      mentions={ep.mentions}
                      hosts={ep.pdHosts || podcastMeta?.hosts}
                      totalEpisodes={ep.pdTotalEpisodes || podcastMeta?.totalEpisodes}
                      yearStarted={ep.pdYearStarted || podcastMeta?.yearStarted}
                      isFollowing={followedSlugs.has(ep.slug)}
                      isBookmarked={bookmarkedKeys.has(`${ep.slug}::${ep.episode_slug}`)}
                      onFollowToggle={handleFollowToggle}
                      onBookmarkToggle={handleBookmarkToggle}
                      toast={toast}
                      testIdPrefix="company-episode"
                      className=""
                    />
                  );
                })()
              ) : (
                <div
                  key={`${ep.slug}/${ep.episode_slug}`}
                  className="p-4 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group"
                  onClick={() => window.open(`/podcasts/${ep.slug}/${ep.episode_slug}`, '_blank')}
                  data-testid={`card-episode-${ep.slug}-${ep.episode_slug}`}
                >
                  <div className="flex items-center gap-4">
                    {ep.artwork_url && (
                      <img src={ep.artwork_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-foreground truncate group-hover:text-primary transition-colors" data-testid={`text-episode-title-${ep.slug}-${ep.episode_slug}`}>
                        {ep.episode_title}
                      </p>
                      <p className="text-base text-[#52525B] dark:text-[#A1A1AA] mt-0.5 flex items-center gap-1.5">
                        <Headphones className="w-3.5 h-3.5" />
                        {ep.podcast_name}
                        {ep.publish_date && (
                          <>
                            <span className="mx-1">&middot;</span>
                            <Calendar className="w-3 h-3" />
                            {new Date(ep.publish_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </>
                        )}
                      </p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-[#52525B] group-hover:text-primary transition-colors flex-shrink-0" />
                  </div>
                  {ep.context && (
                    <p className="mt-3 text-base text-[#52525B] dark:text-[#A1A1AA]/80 leading-relaxed pl-16 italic">
                      &ldquo;{ep.context}&rdquo;
                    </p>
                  )}
                </div>
              )
            ))}
          </div>
          {!showAllEpisodes && company.mentions.length > 8 && (
            <button
              onClick={() => setShowAllEpisodes(true)}
              className="mt-4 w-full py-3 text-base font-semibold text-primary hover:text-primary/80 bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-xl transition-all"
              data-testid="button-show-all-episodes"
            >
              See All {company.mentions.length} Episodes
            </button>
          )}
        </section>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">No episodes found for {company.name} yet.</p>
          <p className="text-[16px] mt-1">Check back soon as we add more podcast recaps.</p>
        </div>
      )}

      {hasRelatedPeople && (
        <section id="section-related-people" className="mb-8">
          <h2 className="text-lg font-display font-bold text-foreground mb-4 flex items-center gap-2" data-testid="heading-related-people">
            <Users className="w-5 h-5 text-primary" />
            Related People
          </h2>
          <div className="flex flex-wrap gap-2">
            {companyData!.relatedPeople!.map((personSlug) => {
              const p = getPersonData(personSlug);
              if (!p) return null;
              return (
                <a
                  key={personSlug}
                  href={`/people/${personSlug}`}
                  className="flex items-center gap-2 bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-full transition-colors group"
                  data-testid={`chip-person-${personSlug}`}
                >
                  <img src={p.imageUrl || `/people/default-avatar.png`} alt={p.name} className="w-5 h-5 rounded-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = `/people/default-avatar.png`; }} />
                  <span className="text-base font-medium text-foreground group-hover:text-primary transition-colors">{p.name}</span>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {hasSimilarCompanies && (
        <section id="section-similar-companies" className="mb-8">
          <h2 className="text-lg font-display font-bold text-foreground mb-4 flex items-center gap-2" data-testid="heading-similar-companies">
            <Building2 className="w-5 h-5 text-primary" />
            Similar Companies
          </h2>
          <div className="flex flex-wrap gap-2">
            {companyData!.similarCompanies!.map((companySlug) => {
              const c = COMPANIES_DIRECTORY.find(x => x.slug === companySlug);
              if (!c) return null;
              return (
                <a
                  key={companySlug}
                  href={`/companies/${companySlug}`}
                  className="flex items-center gap-2 bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-full transition-colors group"
                  data-testid={`chip-company-${companySlug}`}
                >
                  <img src={c.logoUrl} alt={c.name} className="w-5 h-5 rounded object-contain" onError={(e) => { (e.target as HTMLImageElement).src = `/people/default-avatar.png`; }} />
                  <span className="text-base font-medium text-foreground group-hover:text-primary transition-colors">{c.name}</span>
                </a>
              );
            })}
          </div>
        </section>
      )}
    </motion.div>
  ) : null;

  if (isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#F9F9FB] pb-[calc(60px+env(safe-area-inset-bottom,0px))] md:pb-0">
        <div className="px-4 md:px-6 py-6 pb-24 md:pb-8">
          {isLoading ? (
            <div className="space-y-4">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-xl bg-muted animate-pulse" />
                <div className="flex-1">
                  <div className="h-10 bg-muted rounded w-64 animate-pulse mb-3" />
                  <div className="h-5 bg-muted rounded w-96 animate-pulse" />
                </div>
              </div>
              <div className="h-64 bg-muted rounded animate-pulse mt-8" />
            </div>
          ) : company ? (
            <>
              <FeedStyleCard testId="company-feed-card">
                <FeedStyleCardHeader
                  imageUrl={companyData?.logoUrl || "/people/default-avatar.png"}
                  imageAlt={company.name}
                  imageRounded="rounded-xl"
                  name={company.name}
                  meta={companyMetaItems}
                  tintSource={companyData?.logoUrl || company.name}
                  testIdPrefix="company-card"
                />
              </FeedStyleCard>
              <div className="mt-5">
                {companyContent}
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg">Company not found.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background overflow-x-clip">
      {!isLoggedIn && <SiteHeader />}

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20">
        <div className="w-full max-w-6xl">
          <button
            onClick={() => navigate("/companies")}
            className="flex items-center gap-1.5 text-base text-[#52525B] dark:text-[#A1A1AA] hover:text-foreground transition-colors mb-6 mt-4"
            data-testid="button-back-companies"
          >
            <ArrowLeft className="w-4 h-4" />
            All Companies
          </button>

          {isLoading ? (
            <div className="space-y-4">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-xl bg-muted animate-pulse" />
                <div className="flex-1">
                  <div className="h-10 bg-muted rounded w-64 animate-pulse mb-3" />
                  <div className="h-5 bg-muted rounded w-96 animate-pulse" />
                </div>
              </div>
              <div className="h-64 bg-muted rounded animate-pulse mt-8" />
            </div>
          ) : company ? (
            <>
              <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-0">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                  <div className="flex-shrink-0">
                    <img
                      src={companyData?.logoUrl || `/people/default-avatar.png`}
                      alt={company.name}
                      className="w-20 h-20 rounded-xl object-contain bg-white border border-border p-2 shadow-sm"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `/people/default-avatar.png`;
                      }}
                      data-testid="img-company-logo"
                    />
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em] mb-1" data-testid="heading-company-name">
                      {company.name}
                    </h1>
                    <p className="text-base text-muted-foreground mb-3">{company.description}</p>
                    <div className="flex items-center gap-3 text-base justify-center sm:justify-start">
                      <PodcastMicBadge count={new Set(company.mentions.map(m => m.slug)).size} size="lg" />
                      <span className="text-muted-foreground">{company.mentionCount} mentions</span>
                    </div>
                  </div>
                </div>
              </div>
              {companyContent}
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg">Company not found.</p>
            </div>
          )}
        </div>
      </main>

      {!isLoggedIn && <Footer />}
    </div>
  );
}
