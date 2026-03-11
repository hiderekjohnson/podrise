import { useParams } from "wouter";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Users, ExternalLink, Globe, Loader2, Mic, AlertCircle } from "lucide-react";
import { SiX, SiLinkedin, SiInstagram } from "react-icons/si";
import { useQuery } from "@tanstack/react-query";
import { getPodcastBySlug } from "../data/podcastLandingData";
import { EpisodePageLayout } from "@/components/EpisodePageLayout";

interface Guest {
  name: string;
  title: string;
  bio: string;
  twitter?: string | null;
  linkedin?: string | null;
  instagram?: string | null;
  website?: string | null;
  photoUrl?: string | null;
  topicsDiscussed: string[];
}

function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
  } catch {}
  return null;
}

function safeJsonLd(obj: any): string {
  return JSON.stringify(obj).replace(/<\//g, "<\\/").replace(/</g, "\\u003c");
}

export default function EpisodeGuestsPage() {
  const params = useParams<{ podcastSlug: string; episodeSlug: string }>();
  const podcastSlug = params.podcastSlug || "";
  const episodeSlug = params.episodeSlug || "";

  const { data: episode, isLoading: episodeLoading } = useQuery<any>({
    queryKey: ["/api/podcasts", podcastSlug, "recaps", episodeSlug],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/recaps/${episodeSlug}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!podcastSlug && !!episodeSlug,
  });

  const { data: allRecaps = [] } = useQuery<any[]>({
    queryKey: ["/api/podcasts", podcastSlug, "recaps"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/recaps?limit=50`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!podcastSlug,
  });

  const { data: guestsData, isLoading: guestsLoading, isError: guestsError } = useQuery<{ guests: Guest[] }>({
    queryKey: ["/api/podcasts", podcastSlug, episodeSlug, "guests"],
    queryFn: async () => {
      const res = await fetch(`/api/podcasts/${podcastSlug}/${episodeSlug}/guests`);
      if (!res.ok) throw new Error("Failed to load guests");
      return res.json();
    },
    enabled: !!podcastSlug && !!episodeSlug,
    retry: 1,
  });

  const guests = guestsData?.guests || [];
  const podcastConfig = getPodcastBySlug(podcastSlug);

  useEffect(() => {
    if (episode && podcastConfig) {
      const guestNames = guests.length > 0 ? guests.map(g => g.name).join(", ") : "";
      const titleParts = [episode.episodeTitle];
      if (guestNames) titleParts.push(`Guests: ${guestNames}`);
      titleParts.push(episode.podcastName, "PodCap");
      document.title = titleParts.join(" | ");

      const desc = guestNames
        ? `Meet the guests on "${episode.episodeTitle}" — ${guestNames}. Full bios, social media links, and topics discussed on ${episode.podcastName}.`
        : `Guest information for "${episode.episodeTitle}" on ${episode.podcastName}. Discover who appeared on this episode.`;

      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute("content", desc);
      else {
        const meta = document.createElement("meta");
        meta.name = "description";
        meta.content = desc;
        document.head.appendChild(meta);
      }

      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute("content", `${episode.episodeTitle} — Guests | ${episode.podcastName}`);
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute("content", desc);
    }
  }, [episode, podcastConfig, guests]);

  if (episodeLoading || !episode || !podcastConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="page-loader">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const jsonLd = guests.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "PodcastEpisode",
    "name": episode.episodeTitle,
    "partOfSeries": {
      "@type": "PodcastSeries",
      "name": episode.podcastName,
    },
    "actor": guests.map(g => ({
      "@type": "Person",
      "name": g.name,
      "jobTitle": g.title,
      "description": g.bio,
      ...(g.website ? { "url": g.website } : {}),
      "sameAs": [
        g.twitter ? `https://x.com/${g.twitter.replace("@", "")}` : null,
        g.linkedin || null,
        g.instagram ? `https://instagram.com/${g.instagram.replace("@", "")}` : null,
        g.website || null,
      ].filter(Boolean),
    })),
  } : null;

  return (
    <EpisodePageLayout
      episode={episode}
      podcastSlug={podcastSlug}
      episodeSlug={episodeSlug}
      podcastConfig={podcastConfig}
      activeTab="guests"
      allRecaps={allRecaps}
    >
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
        />
      )}

      <div className="max-w-3xl mx-auto" data-testid="guests-content">
        {guestsLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4" data-testid="guests-loading">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] font-medium">Identifying guests from transcript...</p>
          </div>
        ) : guestsError ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center" data-testid="guests-error">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <p className="text-lg font-display font-bold text-foreground mb-1">Unable to load guests</p>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] max-w-sm">
                We couldn't identify the guests for this episode right now. Please try again later.
              </p>
            </div>
          </div>
        ) : guests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center" data-testid="guests-empty">
            <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
              <Mic className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-lg font-display font-bold text-foreground mb-1">No guests on this episode</p>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] max-w-sm">
                This episode features the regular hosts only. Check other episodes for guest appearances.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6" data-testid="guests-list">
            <div className="text-center mb-8">
              <h2 className="text-xl font-display font-bold tracking-tight mb-2" data-testid="text-guests-heading">
                {guests.length === 1 ? "Guest on This Episode" : `${guests.length} Guests on This Episode`}
              </h2>
              <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA]">
                Learn more about {guests.length === 1 ? "the guest" : "the guests"} who appeared on "{episode.episodeTitle}"
              </p>
            </div>

            {guests.map((guest, idx) => (
              <motion.div
                key={guest.name}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="bg-white border border-black/[0.06] rounded-2xl overflow-hidden"
                data-testid={`card-guest-${idx}`}
              >
                <div className="p-6 sm:p-8">
                  <div className="flex items-start gap-5 mb-5">
                    {guest.photoUrl ? (
                      <img
                        src={guest.photoUrl}
                        alt={guest.name}
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-black/[0.06] shrink-0"
                        data-testid={`img-guest-${idx}`}
                      />
                    ) : (
                      <div
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/[0.08] flex items-center justify-center shrink-0 border-2 border-primary/[0.12]"
                        data-testid={`avatar-guest-${idx}`}
                      >
                        <Users className="w-7 h-7 sm:w-8 sm:h-8 text-primary/60" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg sm:text-xl font-display font-bold tracking-tight" data-testid={`text-guest-name-${idx}`}>
                        {guest.name}
                      </h3>
                      {guest.title && (
                        <p className="text-sm text-primary font-semibold mt-0.5" data-testid={`text-guest-title-${idx}`}>
                          {guest.title}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2 mt-3">
                        {guest.twitter && (() => {
                          const twitterUrl = guest.twitter!.startsWith("http") ? guest.twitter! : `https://x.com/${guest.twitter!.replace("@", "")}`;
                          const safe = safeUrl(twitterUrl);
                          if (!safe) return null;
                          return (
                            <a
                              href={safe}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/[0.04] hover:bg-black/[0.07] rounded-lg text-[15px] font-semibold text-foreground/80 hover:text-foreground transition-colors"
                              data-testid={`link-guest-twitter-${idx}`}
                            >
                              <SiX className="w-3.5 h-3.5" />
                              {guest.twitter!.startsWith("http") ? "X / Twitter" : guest.twitter}
                              <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                            </a>
                          );
                        })()}
                        {guest.linkedin && safeUrl(guest.linkedin) && (
                          <a
                            href={safeUrl(guest.linkedin)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/[0.04] hover:bg-black/[0.07] rounded-lg text-[15px] font-semibold text-foreground/80 hover:text-foreground transition-colors"
                            data-testid={`link-guest-linkedin-${idx}`}
                          >
                            <SiLinkedin className="w-3.5 h-3.5 text-[#0A66C2]" />
                            LinkedIn
                            <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                          </a>
                        )}
                        {guest.instagram && (() => {
                          const igUrl = guest.instagram!.startsWith("http") ? guest.instagram! : `https://instagram.com/${guest.instagram!.replace("@", "")}`;
                          const safe = safeUrl(igUrl);
                          if (!safe) return null;
                          return (
                            <a
                              href={safe}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/[0.04] hover:bg-black/[0.07] rounded-lg text-[15px] font-semibold text-foreground/80 hover:text-foreground transition-colors"
                              data-testid={`link-guest-instagram-${idx}`}
                            >
                              <SiInstagram className="w-3.5 h-3.5 text-[#E4405F]" />
                              {guest.instagram!.startsWith("http") ? "Instagram" : guest.instagram}
                              <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                            </a>
                          );
                        })()}
                        {guest.website && safeUrl(guest.website) && (
                          <a
                            href={safeUrl(guest.website)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/[0.04] hover:bg-black/[0.07] rounded-lg text-[15px] font-semibold text-foreground/80 hover:text-foreground transition-colors"
                            data-testid={`link-guest-website-${idx}`}
                          >
                            <Globe className="w-3.5 h-3.5" />
                            Website
                            <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {guest.bio && (
                    <div className="mb-5">
                      <p className="text-[15px] leading-[1.75] text-foreground/80" data-testid={`text-guest-bio-${idx}`}>
                        {guest.bio}
                      </p>
                    </div>
                  )}

                  {guest.topicsDiscussed.length > 0 && (
                    <div>
                      <p className="text-[15px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
                        Topics Discussed
                      </p>
                      <div className="flex flex-wrap gap-2" data-testid={`topics-guest-${idx}`}>
                        {guest.topicsDiscussed.map((topic, i) => (
                          <span
                            key={i}
                            className="px-3 py-1.5 bg-primary/[0.06] text-primary text-base font-medium rounded-lg"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </EpisodePageLayout>
  );
}
