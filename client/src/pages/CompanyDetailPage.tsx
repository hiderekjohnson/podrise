import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, MessageSquare, Headphones, Calendar, ExternalLink, Building2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

interface EpisodeEntry {
  slug: string;
  episode_slug: string;
  podcast_name: string;
  episode_title: string;
  publish_date: string;
  artwork_url: string;
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
              <div className="h-10 bg-muted rounded w-64 animate-pulse" />
              <div className="h-5 bg-muted rounded w-96 animate-pulse" />
              <div className="h-64 bg-muted rounded animate-pulse mt-8" />
            </div>
          ) : company ? (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em]" data-testid="heading-company-name">
                    {company.name}
                  </h1>
                </div>
                <p className="text-base text-muted-foreground mb-4 ml-[52px]">{company.description}</p>
                <div className="flex flex-wrap gap-4 ml-[52px]">
                  <div className="flex items-center gap-1.5 text-sm">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-foreground">{company.mentionCount}</span>
                    <span className="text-muted-foreground">mentions across podcasts</span>
                  </div>
                </div>
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
                        className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group"
                        onClick={() => navigate(`/podcasts/${ep.slug}/${ep.episode_slug}`)}
                        data-testid={`card-episode-${ep.slug}-${ep.episode_slug}`}
                      >
                        {ep.artwork_url && (
                          <img src={ep.artwork_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors" data-testid={`text-episode-title-${ep.slug}-${ep.episode_slug}`}>
                            {ep.episode_title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                            <Headphones className="w-3 h-3" />
                            {ep.podcast_name}
                            {ep.publish_date && (
                              <>
                                <span className="mx-1">·</span>
                                <Calendar className="w-3 h-3" />
                                {new Date(ep.publish_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </>
                            )}
                          </p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors flex-shrink-0" />
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
