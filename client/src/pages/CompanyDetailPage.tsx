import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, MessageSquare, Headphones, Calendar, ExternalLink, Building2, Globe, MapPin, Users, DollarSign, Briefcase, Clock, Zap } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import { getCompanyBySlug, getPersonBySlug as getPersonData, COMPANIES_DIRECTORY, PEOPLE_DIRECTORY } from "@/data/entityDirectoryData";
import { PodCapWordmark } from "@/components/PodCapHeader";

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
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/companies/:slug");
  const slug = params?.slug || "";
  const { data: user } = useAuth();
  const companyData = getCompanyBySlug(slug);

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
    const title = `${company.name} - Podcast Mentions & Discussions | PodCap`;
    const desc = `See every podcast episode where ${company.name} is discussed. ${company.mentionCount} mentions across top podcasts.`;
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

  const details = companyData?.details;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center" data-testid="link-home">
          <PodCapWordmark />
        </a>
        <div className="flex items-center gap-4">
          {user ? (
            <a href="/dashboard" className="text-base font-medium text-primary hover:text-primary/80 transition-colors" data-testid="link-dashboard">Dashboard</a>
          ) : (
            <>
              <a href="/get-started" className="flex items-center gap-1.5 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-[15px] font-semibold text-primary tracking-wide uppercase hover:bg-primary/15 transition-colors" data-testid="link-nav-get-started">
                <Zap className="w-3.5 h-3.5" />
                Build Your Recap
              </a>
              <a href="/login" className="text-base font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-login">Log in</a>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20">
        <div className="w-full max-w-3xl">
          <button
            onClick={() => navigate("/companies")}
            className="flex items-center gap-1.5 text-base text-[#3F3F46] dark:text-[#A1A1AA] hover:text-foreground transition-colors mb-6 mt-4"
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
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-8">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-6">
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
                    <div className="flex items-center gap-1.5 text-base justify-center sm:justify-start">
                      <MessageSquare className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-foreground">{company.mentionCount}</span>
                      <span className="text-muted-foreground">mentions across podcasts</span>
                    </div>
                  </div>
                </div>

                {companyData?.background && (
                  <p className="text-base text-muted-foreground/80 leading-relaxed mb-6" data-testid="text-company-background">
                    {companyData.background}
                  </p>
                )}

                {details && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="section-company-details">
                    <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                      <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">Headquarters</p>
                        <p className="text-base font-medium text-foreground">{details.headquarters}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                      <Clock className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">Founded</p>
                        <p className="text-base font-medium text-foreground">{details.founded}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                      <Users className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">Employees</p>
                        <p className="text-base font-medium text-foreground">{details.employees}</p>
                      </div>
                    </div>
                    {details.marketCap && (
                      <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                        <DollarSign className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">Market Cap</p>
                          <p className="text-base font-medium text-foreground">{details.marketCap}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                      <Briefcase className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">CEO</p>
                        <p className="text-base font-medium text-foreground">{details.ceo}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                      <Building2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">Industry</p>
                        <p className="text-base font-medium text-foreground">{details.industry}</p>
                      </div>
                    </div>
                    {details.website && (
                      <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg col-span-2 sm:col-span-3">
                        <Globe className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">Website</p>
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
                  <div className="mt-6 pt-4 border-t border-border" data-testid="section-associated-terms">
                    <p className="text-[15px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Associated Terms</p>
                    <div className="flex flex-wrap gap-2">
                      {companyData.associatedTerms.map((term) => (
                        <span key={term} className="px-3 py-1.5 bg-primary/10 text-primary text-base font-medium rounded-full" data-testid={`badge-term-${term.toLowerCase().replace(/\s+/g, '-')}`}>
                          {term}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {companyData?.relatedPeople && companyData.relatedPeople.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-border" data-testid="section-related-people">
                    <p className="text-[15px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Related People</p>
                    <div className="flex flex-wrap gap-2">
                      {companyData.relatedPeople.map((personSlug) => {
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
                  </div>
                )}

                {companyData?.similarCompanies && companyData.similarCompanies.length > 0 && (
                  <div className={`mt-4 ${companyData?.relatedPeople?.length ? '' : 'pt-4 border-t border-border'}`} data-testid="section-similar-companies">
                    <p className="text-[15px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Similar Companies</p>
                    <div className="flex flex-wrap gap-2">
                      {companyData.similarCompanies.map((companySlug) => {
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
                  </div>
                )}
              </div>

              {company.mentions.length > 0 ? (
                <section className="mb-10">
                  <h2 className="text-lg font-display font-bold text-foreground mb-4 flex items-center gap-2" data-testid="heading-mentioned-episodes">
                    <MessageSquare className="w-5 h-5 text-primary" />
                    Episodes Mentioning {company.name}
                  </h2>
                  <div className="space-y-2">
                    {company.mentions.map((ep) => (
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
                            <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-0.5 flex items-center gap-1.5">
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
                          <ExternalLink className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors flex-shrink-0" />
                        </div>
                        {ep.context && (
                          <p className="mt-3 text-base text-[#3F3F46] dark:text-[#A1A1AA]/80 leading-relaxed pl-16 italic">
                            &ldquo;{ep.context}&rdquo;
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <p className="text-lg">No episodes found for {company.name} yet.</p>
                  <p className="text-sm mt-1">Check back soon as we add more podcast recaps.</p>
                </div>
              )}

            </motion.div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg">Company not found.</p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
