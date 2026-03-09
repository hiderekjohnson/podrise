import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Building2, ArrowRight, MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

interface CompanySummary {
  slug: string;
  name: string;
  description: string;
  mentionCount: number;
}

function SEOHead() {
  const title = "Companies in Podcasts — Discover What's Being Discussed | PodCap";
  const description = "Explore the most talked-about companies across top podcasts. See which companies get mentioned the most and find every episode they're discussed in.";

  if (typeof document !== "undefined") {
    document.title = title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", description);
    else {
      const meta = document.createElement("meta");
      meta.name = "description";
      meta.content = description;
      document.head.appendChild(meta);
    }
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) { ogTitle = document.createElement("meta"); (ogTitle as HTMLMetaElement).setAttribute("property", "og:title"); document.head.appendChild(ogTitle); }
    ogTitle.setAttribute("content", title);
    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (!ogDesc) { ogDesc = document.createElement("meta"); (ogDesc as HTMLMetaElement).setAttribute("property", "og:description"); document.head.appendChild(ogDesc); }
    ogDesc.setAttribute("content", description);
  }
  return null;
}

export default function CompaniesDirectory() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();

  const { data: companies, isLoading } = useQuery<CompanySummary[]>({
    queryKey: ["/api/entities/companies"],
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead />
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
        <section className="w-full max-w-4xl pt-10 sm:pt-16 pb-10">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex flex-col items-center text-center gap-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em]" data-testid="heading-companies">
              Companies in Podcasts
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
              Discover the most talked-about companies across top podcasts. See which companies are shaping conversations and find every episode where they're discussed.
            </p>
          </motion.div>
        </section>

        {isLoading ? (
          <div className="w-full max-w-3xl space-y-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-6 animate-pulse">
                <div className="h-6 bg-muted rounded w-48 mb-3" />
                <div className="h-4 bg-muted rounded w-64" />
              </div>
            ))}
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.2 }} className="w-full max-w-3xl space-y-3">
            {companies?.map((company, index) => (
              <motion.div
                key={company.slug}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.04 }}
              >
                <div
                  className="bg-card border border-border rounded-xl p-6 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer group"
                  onClick={() => navigate(`/companies/${company.slug}`)}
                  data-testid={`card-company-${company.slug}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-sm font-bold text-primary/60 tabular-nums">#{index + 1}</span>
                        <h2 className="text-xl font-display font-bold text-foreground group-hover:text-primary transition-colors" data-testid={`text-company-name-${company.slug}`}>
                          {company.name}
                        </h2>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3 pl-8">{company.description}</p>
                      <div className="flex flex-wrap gap-4 pl-8">
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Mentioned in <span className="font-semibold text-foreground">{company.mentionCount}</span> episodes</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-9 h-9 rounded-full bg-primary/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                        <ArrowRight className="w-4 h-4 text-primary/60 group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>

      <Footer />
    </div>
  );
}
