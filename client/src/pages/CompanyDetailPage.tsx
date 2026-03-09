import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, MessageSquare, Headphones, Calendar, ExternalLink, Building2, Globe, MapPin, Users, DollarSign, Briefcase, Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import { getCompanyBySlug } from "@/data/entityDirectoryData";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

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
    const title = `${company.name} — Podcast Mentions & Discussions | PodCap`;
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
          <img src={logoPath} alt="PodCap" className="h-9 object-contain" />
        </a>
        <div className="flex items-center gap-4">
          {user ? (
            <a href="/dashboard" className="text-base font-medium text-primary hover:text-primary/80 transition-colors" data-testid="link-dashboard">Dashboard</a>
          ) : (
            <a href="/login" className="text-base font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-login">Log in</a>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20">
        <div className="w-full max-w-3xl">
          <button
            onClick={() => navigate("/companies")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 mt-4"
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
                      src={companyData?.logoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(company.name)}&size=80&background=1a8cff&color=fff&bold=true`}
                      alt={company.name}
                      className="w-20 h-20 rounded-xl object-contain bg-white border border-border p-2 shadow-sm"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(company.name)}&size=80&background=1a8cff&color=fff&bold=true`;
                      }}
                      data-testid="img-company-logo"
                    />
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em] mb-1" data-testid="heading-company-name">
                      {company.name}
                    </h1>
                    <p className="text-base text-muted-foreground mb-3">{company.description}</p>
                    <div className="flex items-center gap-1.5 text-sm justify-center sm:justify-start">
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
                        <p className="text-sm text-muted-foreground">Headquarters</p>
                        <p className="text-base font-medium text-foreground">{details.headquarters}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                      <Clock className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-muted-foreground">Founded</p>
                        <p className="text-base font-medium text-foreground">{details.founded}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                      <Users className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-muted-foreground">Employees</p>
                        <p className="text-base font-medium text-foreground">{details.employees}</p>
                      </div>
                    </div>
                    {details.marketCap && (
                      <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                        <DollarSign className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-muted-foreground">Market Cap</p>
                          <p className="text-base font-medium text-foreground">{details.marketCap}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                      <Briefcase className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-muted-foreground">CEO</p>
                        <p className="text-base font-medium text-foreground">{details.ceo}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                      <Building2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-muted-foreground">Industry</p>
                        <p className="text-base font-medium text-foreground">{details.industry}</p>
                      </div>
                    </div>
                    {details.website && (
                      <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg col-span-2 sm:col-span-3">
                        <Globe className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-muted-foreground">Website</p>
                          <a href={details.website} target="_blank" rel="noopener noreferrer" className="text-base font-medium text-primary hover:text-primary/80 transition-colors" data-testid="link-company-website">
                            {details.website.replace("https://", "")}
                          </a>
                        </div>
                      </div>
                    )}
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
                        onClick={() => navigate(`/podcasts/${ep.slug}/${ep.episode_slug}`)}
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
                            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
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
                          <p className="mt-3 text-sm text-muted-foreground/80 leading-relaxed pl-16 italic">
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
