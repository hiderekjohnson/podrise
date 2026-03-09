import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Users, ArrowRight, Mic, MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import { PEOPLE_DIRECTORY } from "@/data/entityDirectoryData";
import logoPath from "@assets/Podcap_logo_1772731738179.png";

interface PersonSummary {
  slug: string;
  name: string;
  title: string;
  mentionCount: number;
  guestCount: number;
}

function SEOHead() {
  const title = "Notable People in Podcasts — Who's Being Discussed | PodCap";
  const description = "Explore the most talked-about people across top podcasts. See who appears as a guest, who gets mentioned the most, and find every episode they're featured in.";

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
    setOrCreate('meta[name="description"]', "name", description);
    setOrCreate('meta[property="og:title"]', "property", title);
    setOrCreate('meta[property="og:description"]', "property", description);
  }
  return null;
}

export default function PeopleDirectory() {
  const [, navigate] = useLocation();
  const { data: user } = useAuth();

  const { data: people, isLoading } = useQuery<PersonSummary[]>({
    queryKey: ["/api/entities/people"],
  });

  const getPersonData = (slug: string) => PEOPLE_DIRECTORY.find(p => p.slug === slug);

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
                <Users className="w-6 h-6 text-primary" />
              </div>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-extrabold text-foreground leading-[1.1] tracking-[-0.02em]" data-testid="heading-people">
              People
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
              The most influential leaders, founders, and thinkers driving today's biggest ideas. See where they show up as guests, how often they're discussed, and explore every episode they're featured in.
            </p>
            <p className="text-sm text-muted-foreground mt-3">
              Looking for notable companies?{" "}
              <a href="/companies" className="text-primary font-medium hover:text-primary/80 transition-colors" data-testid="link-companies-directory">
                Explore Companies →
              </a>
            </p>
          </motion.div>
        </section>

        {isLoading ? (
          <div className="w-full max-w-3xl space-y-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-6 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-muted" />
                  <div className="flex-1">
                    <div className="h-6 bg-muted rounded w-48 mb-3" />
                    <div className="h-4 bg-muted rounded w-64" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.2 }} className="w-full max-w-3xl space-y-3">
            {people?.map((person, index) => {
              const personData = getPersonData(person.slug);
              return (
                <motion.div
                  key={person.slug}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.04 }}
                >
                  <div
                    className="bg-card border border-border rounded-xl p-5 sm:p-6 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer group"
                    onClick={() => navigate(`/people/${person.slug}`)}
                    data-testid={`card-person-${person.slug}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0">
                        <img
                          src={personData?.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(person.name)}&size=56&background=1a8cff&color=fff&bold=true`}
                          alt={person.name}
                          className="w-14 h-14 rounded-full object-cover border-2 border-border group-hover:border-primary/30 transition-colors"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(person.name)}&size=56&background=1a8cff&color=fff&bold=true`;
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-lg sm:text-xl font-display font-bold text-foreground group-hover:text-primary transition-colors mb-0.5" data-testid={`text-person-name-${person.slug}`}>
                          {person.name}
                        </h2>
                        <p className="text-sm text-muted-foreground mb-2">{person.title}</p>
                        <div className="flex flex-wrap gap-3">
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Mentioned in <span className="font-semibold text-foreground">{person.mentionCount}</span> episodes</span>
                          </div>
                          {person.guestCount > 0 && (
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Mic className="w-3.5 h-3.5" />
                              <span>Guest on <span className="font-semibold text-foreground">{person.guestCount}</span> episodes</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <div className="w-9 h-9 rounded-full bg-primary/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                          <ArrowRight className="w-4 h-4 text-primary/60 group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </main>

      <Footer />
    </div>
  );
}
