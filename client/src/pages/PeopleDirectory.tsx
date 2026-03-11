import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Users, ArrowRight, Mic, MessageSquare, Search, ChevronDown, Zap } from "lucide-react";
import { Footer } from "@/components/Footer";
import { PEOPLE_DIRECTORY } from "@/data/entityDirectoryData";
import { SiteHeader } from "@/components/SiteHeader";

interface PersonSummary {
  slug: string;
  name: string;
  title: string;
  mentionCount: number;
  guestCount: number;
  gender: string;
  category: string;
}

const CATEGORIES = [
  "All Categories",
  "Tech & AI",
  "Venture Capital",
  "Business & Entrepreneurship",
  "Creator & Influencer",
  "Media & Journalism",
  "Author & Thought Leader",
  "Finance & Investing",
  "Entertainment",
  "Politics & Public Figures",
  "Science & Health",
];

const PAGE_SIZE = 24;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function SEOHead() {
  const title = "Notable People in Podcasts | PodCap";
  const description = "Explore the most talked-about people across top podcasts. See who appears as a guest, who gets mentioned most, and discover searchable transcripts, podcast recaps, and podcast summaries featuring them.";

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

  const [searchQuery, setSearchQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [sortBy, setSortBy] = useState<"mentions" | "guests">("guests");
  const [letterFilter, setLetterFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: people, isLoading } = useQuery<PersonSummary[]>({
    queryKey: ["/api/entities/people"],
  });

  const getPersonData = (slug: string) => PEOPLE_DIRECTORY.find(p => p.slug === slug);

  const filteredPeople = useMemo(() => {
    if (!people) return [];
    setVisibleCount(PAGE_SIZE);

    let result = [...people];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) || p.title.toLowerCase().includes(q)
      );
    }

    if (letterFilter) {
      result = result.filter(p => p.name.charAt(0).toUpperCase() === letterFilter);
    }

    if (genderFilter !== "all") {
      result = result.filter(p => p.gender === genderFilter);
    }

    if (categoryFilter !== "All Categories") {
      result = result.filter(p => p.category === categoryFilter);
    }

    result.sort((a, b) => {
      if (sortBy === "guests") return b.guestCount - a.guestCount;
      return b.mentionCount - a.mentionCount;
    });

    return result;
  }, [people, searchQuery, genderFilter, categoryFilter, sortBy, letterFilter]);

  const visiblePeople = filteredPeople.slice(0, visibleCount);
  const hasMore = visibleCount < filteredPeople.length;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEOHead />
      <SiteHeader />

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-20">
        <section className="w-full max-w-4xl pt-10 sm:pt-16 pb-8">
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
            <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mt-3">
              Looking for notable companies?{" "}
              <a href="/companies" className="text-primary font-medium hover:text-primary/80 transition-colors" data-testid="link-companies-directory">
                Explore Companies →
              </a>
            </p>
          </motion.div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="w-full max-w-3xl mb-6"
        >
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Search people..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setLetterFilter(null); }}
              className="w-full pl-11 pr-4 py-3 bg-card border border-border rounded-xl text-[17px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
              data-testid="input-search-people"
            />
          </div>

          <div className="flex flex-wrap gap-1 mb-4" data-testid="alphabet-filter">
            <button
              onClick={() => setLetterFilter(null)}
              className={`px-3 py-2 rounded-lg text-[15px] min-h-[44px] min-w-[44px] font-semibold transition-all ${!letterFilter ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              data-testid="letter-all"
            >
              All
            </button>
            {ALPHABET.map(letter => (
              <button
                key={letter}
                onClick={() => { setLetterFilter(letter === letterFilter ? null : letter); setSearchQuery(""); }}
                className={`px-3 py-2 rounded-lg text-[15px] min-h-[44px] min-w-[44px] font-semibold transition-all ${letterFilter === letter ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                data-testid={`letter-${letter}`}
              >
                {letter}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2.5 items-center">
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 bg-card border border-border rounded-lg text-[17px] text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                data-testid="select-category-filter"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={genderFilter}
                onChange={(e) => setGenderFilter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 bg-card border border-border rounded-lg text-[17px] text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                data-testid="select-gender-filter"
              >
                <option value="all">All Genders</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>

            <div className="flex items-center gap-1 pl-3 pr-1 py-1 bg-card border border-border rounded-lg" data-testid="sort-control">
              <span className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mr-1">Sort by:</span>
              <button
                onClick={() => setSortBy("guests")}
                className={`px-3.5 py-2 rounded-lg text-base min-h-[44px] font-medium transition-all ${sortBy === "guests" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                data-testid="sort-appearances"
              >
                Most Appearances
              </button>
              <button
                onClick={() => setSortBy("mentions")}
                className={`px-3.5 py-2 rounded-lg text-base min-h-[44px] font-medium transition-all ${sortBy === "mentions" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                data-testid="sort-mentions"
              >
                Most Mentions
              </button>
            </div>

          </div>
        </motion.section>

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
        ) : filteredPeople.length === 0 ? (
          <div className="w-full max-w-3xl text-center py-16">
            <p className="text-muted-foreground text-lg" data-testid="text-no-results">No people found matching your filters.</p>
            <button
              onClick={() => { setSearchQuery(""); setGenderFilter("all"); setCategoryFilter("All Categories"); setLetterFilter(null); }}
              className="mt-3 text-primary text-base font-medium hover:text-primary/80 transition-colors"
              data-testid="button-clear-filters"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <div className="w-full max-w-3xl space-y-3">
            {visiblePeople.map((person, index) => {
              const personData = getPersonData(person.slug);
              return (
                <motion.div
                  key={person.slug}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.015, 0.3) }}
                >
                  <div
                    className="bg-card border border-border rounded-xl p-5 sm:p-6 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer group"
                    onClick={() => navigate(`/people/${person.slug}`)}
                    data-testid={`card-person-${person.slug}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0">
                        <img
                          src={personData?.imageUrl || '/people/default-avatar.png'}
                          alt={person.name}
                          className="w-14 h-14 rounded-full object-cover border-2 border-border group-hover:border-primary/30 transition-colors"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/people/default-avatar.png';
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-lg sm:text-xl font-display font-bold text-foreground group-hover:text-primary transition-colors mb-0.5" data-testid={`text-person-name-${person.slug}`}>
                          {person.name}
                        </h2>
                        <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] mb-2">{person.title}</p>
                        <div className="flex flex-wrap gap-3">
                          <div className="flex items-center gap-1.5 text-base text-[#3F3F46] dark:text-[#A1A1AA]">
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Mentioned in <span className="font-semibold text-foreground">{person.mentionCount}</span> episodes</span>
                          </div>
                          {person.guestCount > 0 && (
                            <div className="flex items-center gap-1.5 text-base text-[#3F3F46] dark:text-[#A1A1AA]">
                              <Mic className="w-3.5 h-3.5" />
                              <span>Guest on <span className="font-semibold text-foreground">{person.guestCount}</span> episodes</span>
                            </div>
                          )}
                          {person.category && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/[0.06] text-[15px] font-medium text-primary" data-testid={`badge-category-${person.slug}`}>
                              {person.category}
                            </span>
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

            {hasMore && (
              <div className="flex flex-col items-center gap-2 pt-4 pb-2">
                <button
                  onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                  className="px-6 py-2.5 bg-primary/10 border border-primary/20 rounded-xl text-base font-semibold text-primary hover:bg-primary/15 transition-colors"
                  data-testid="button-show-more"
                >
                  Show More
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}