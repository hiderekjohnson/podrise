import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Mic, MessageSquare, Headphones, Calendar, ExternalLink, Globe } from "lucide-react";
import { SiX, SiLinkedin, SiInstagram } from "react-icons/si";
import { useAuth } from "@/hooks/use-auth";
import { Footer } from "@/components/Footer";
import { getPersonBySlug } from "@/data/entityDirectoryData";
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

interface PersonDetail {
  name: string;
  title: string;
  slug: string;
  guestAppearances: EpisodeEntry[];
  mentions: EpisodeEntry[];
  guestCount: number;
  mentionCount: number;
}

function EpisodeCard({ episode, type }: { episode: EpisodeEntry; type: "guest" | "mention" }) {
  const [, navigate] = useLocation();
  const date = episode.publish_date ? new Date(episode.publish_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

  return (
    <div
      className="p-4 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group"
      onClick={() => navigate(`/podcasts/${episode.slug}/${episode.episode_slug}`)}
      data-testid={`card-episode-${episode.slug}-${episode.episode_slug}`}
    >
      <div className="flex items-center gap-4">
        {episode.artwork_url && (
          <img src={episode.artwork_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-foreground truncate group-hover:text-primary transition-colors" data-testid={`text-episode-title-${episode.slug}-${episode.episode_slug}`}>
            {episode.episode_title}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Headphones className="w-3.5 h-3.5" />
            {episode.podcast_name}
            {date && (
              <>
                <span className="mx-1">&middot;</span>
                <Calendar className="w-3 h-3" />
                {date}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {type === "guest" && (
            <span className="text-sm bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-medium">Guest</span>
          )}
          <ExternalLink className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
        </div>
      </div>
      {type === "mention" && episode.context && (
        <p className="mt-3 text-sm text-muted-foreground/80 leading-relaxed pl-16 italic">
          &ldquo;{episode.context}&rdquo;
        </p>
      )}
    </div>
  );
}

function EpisodeTabs({ person }: { person: PersonDetail }) {
  const hasGuests = person.guestAppearances.length > 0;
  const hasMentions = person.mentions.length > 0;
  const [activeTab, setActiveTab] = useState<"guests" | "mentions">(hasGuests ? "guests" : "mentions");

  if (!hasGuests && !hasMentions) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg">No episodes found for {person.name} yet.</p>
        <p className="text-sm mt-1">Check back soon as we add more podcast recaps.</p>
      </div>
    );
  }

  return (
    <section className="mb-10">
      <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl mb-5" data-testid="tabs-episode-type">
        <button
          onClick={() => setActiveTab("guests")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "guests"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-guest-appearances"
        >
          <Mic className="w-4 h-4" />
          Guest Appearances
          <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${
            activeTab === "guests" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}>
            {person.guestCount}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("mentions")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "mentions"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-mentions"
        >
          <MessageSquare className="w-4 h-4" />
          Mentions
          <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${
            activeTab === "mentions" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}>
            {person.mentionCount}
          </span>
        </button>
      </div>

      {activeTab === "guests" && (
        <div className="space-y-2">
          {person.guestAppearances.length > 0 ? (
            person.guestAppearances.map((ep) => (
              <EpisodeCard key={`${ep.slug}/${ep.episode_slug}`} episode={ep} type="guest" />
            ))
          ) : (
            <p className="text-center py-8 text-muted-foreground text-sm">No guest appearances found yet.</p>
          )}
        </div>
      )}

      {activeTab === "mentions" && (
        <div className="space-y-2">
          {person.mentions.length > 0 ? (
            person.mentions.map((ep) => (
              <EpisodeCard key={`${ep.slug}/${ep.episode_slug}`} episode={ep} type="mention" />
            ))
          ) : (
            <p className="text-center py-8 text-muted-foreground text-sm">No mentions found yet.</p>
          )}
        </div>
      )}
    </section>
  );
}

export default function PersonDetailPage() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/people/:slug");
  const slug = params?.slug || "";
  const { data: user } = useAuth();
  const personData = getPersonBySlug(slug);

  const { data: person, isLoading } = useQuery<PersonDetail>({
    queryKey: ["/api/entities/people", slug],
    queryFn: async () => {
      const res = await fetch(`/api/entities/people/${slug}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!slug,
  });

  if (typeof document !== "undefined" && person) {
    const title = `${person.name} — Podcast Appearances & Mentions | PodCap`;
    const desc = `See every podcast episode where ${person.name} appears as a guest or gets mentioned. ${person.guestCount} guest appearances and ${person.mentionCount} mentions across top podcasts.`;
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

  const socialLinks = personData?.socialLinks;

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
            onClick={() => navigate("/people")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 mt-4"
            data-testid="button-back-people"
          >
            <ArrowLeft className="w-4 h-4" />
            All People
          </button>

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
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-8 bg-card border border-border rounded-2xl p-6 sm:p-8">
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
                    {person.name}
                  </h1>
                  <p className="text-base text-muted-foreground mb-3">{person.title}</p>

                  {personData?.bio && (
                    <p className="text-base text-muted-foreground/80 leading-relaxed mb-4" data-testid="text-person-bio">
                      {personData.bio}
                    </p>
                  )}

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
                    <div className="flex items-center gap-1.5 text-sm">
                      <Mic className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-foreground">{person.guestCount}</span>
                      <span className="text-muted-foreground">guest appearances</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <MessageSquare className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-foreground">{person.mentionCount}</span>
                      <span className="text-muted-foreground">mentions</span>
                    </div>
                  </div>
                </div>
              </div>

              <EpisodeTabs person={person} />
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
