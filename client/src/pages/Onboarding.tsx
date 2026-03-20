// See BRAND.md for all typography, color, spacing, and accessibility rules.
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, Search, Podcast, X } from "lucide-react";
import { SiSpotify } from "react-icons/si";
import { motion, AnimatePresence } from "framer-motion";
import { PodRiseWordmark } from "@/components/PodRiseHeader";
import { hiResArtwork } from "@/lib/utils";

interface SearchResult {
  id: string;
  name: string;
  artistName: string;
  artworkUrl: string;
  slug: string;
  onPlatform?: boolean;
  hasLandingPage?: boolean;
  genre?: string;
}

interface StaffPick {
  slug: string;
  name: string;
  artworkUrl: string;
  category: string | null;
  description: string | null;
  followers: number | null;
}

function PodcastRow({
  slug,
  name,
  artworkUrl,
  meta,
  isSelected,
  onToggle,
  testId,
}: {
  slug: string;
  name: string;
  artworkUrl: string;
  meta: string;
  isSelected: boolean;
  onToggle: () => void;
  testId: string;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-[13px] px-4 py-[11px] min-h-[66px] text-left transition-colors border-b border-[#F0F0F2] dark:border-[#1C1C22] last:border-b-0 focus:outline-none focus:ring-[3px] focus:ring-[#6366F1] focus:ring-offset-[3px] ${
        isSelected
          ? "bg-[#EEF2FF] dark:bg-[#1e1b4b]"
          : "hover:bg-[#F7F7FC] dark:hover:bg-[#18181B]"
      }`}
      data-testid={testId}
    >
      <div className="w-[44px] h-[44px] rounded-[9px] overflow-hidden flex-shrink-0 bg-[#F7F7FC] dark:bg-[#1C1C22]">
        {artworkUrl ? (
          <img src={hiResArtwork(artworkUrl)} alt={name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Podcast className="w-5 h-5 text-[#6366F1]" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-[15px] truncate leading-[1.4] mb-[1px] ${
          isSelected ? "text-[#3730A3] dark:text-[#A5B4FC]" : "text-[#09090B] dark:text-white"
        }`}>{name}</p>
        <p className={`text-[13px] truncate ${
          isSelected ? "text-[#6366F1] dark:text-[#818CF8]" : "text-[#A1A1AA] dark:text-[#71717A]"
        }`}>{meta}</p>
      </div>
      <div className={`w-[30px] h-[30px] rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
        isSelected
          ? "bg-[#6366F1] border-[#6366F1] text-white"
          : "border-2 border-[#E4E4E7] dark:border-[#3F3F46] text-transparent"
      }`}>
        <Check className="w-3 h-3" strokeWidth={3} />
      </div>
    </button>
  );
}

export default function Onboarding() {
  const { data: user } = useAuth();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedPodcasts, setSelectedPodcasts] = useState<Map<string, { name: string; artworkUrl: string }>>(new Map());
  const [importingSpotify, setImportingSpotify] = useState(false);
  const spotifyImportHandled = useRef(false);

  const { data: spotifyStatus } = useQuery<{ configured: boolean; connected: boolean }>({
    queryKey: ["/api/spotify/status"],
  });

  const { data: staffPicksData, isLoading: staffPicksLoading } = useQuery<{ podcasts: StaffPick[] }>({
    queryKey: ["/api/onboarding/suggestions"],
  });

  const staffPicks = staffPicksData?.podcasts?.slice(0, 10) || [];

  useEffect(() => {
    document.title = "Set Up Your Feed | PodRise";
  }, []);

  useEffect(() => {
    if (user && user.onboardingCompleted) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      const allSlugs = Array.from(selectedPodcasts.keys());
      const uniqueSlugs = [...new Set(allSlugs)];
      const res = await apiRequest("POST", "/api/onboarding/complete", {
        podcasts: uniqueSlugs,
        industries: [],
        interests: [],
        roles: [],
      });
      return res.json();
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/auth/me"], updatedUser);
      navigate("/dashboard?welcome=true");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save preferences", variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (spotifyImportHandled.current) return;

    if (params.get("spotify_error")) {
      spotifyImportHandled.current = true;
      const errorType = params.get("spotify_error");
      toast({
        title: "Spotify import failed",
        description: errorType === "denied"
          ? "You denied access to your Spotify account. You can still search for podcasts manually."
          : "Something went wrong connecting to Spotify. Please try again.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/onboarding");
      return;
    }

    if (params.get("spotify_connected") === "true") {
      spotifyImportHandled.current = true;
      window.history.replaceState({}, "", "/onboarding");
      setImportingSpotify(true);

      (async () => {
        try {
          const res = await fetch("/api/spotify/shows", { credentials: "include" });
          if (!res.ok) throw new Error("Failed to fetch shows");
          const data = await res.json();
          const shows = data.shows || [];
          if (shows.length === 0) {
            toast({ title: "No podcasts found", description: "We didn't find any saved shows on your Spotify account." });
            setImportingSpotify(false);
            return;
          }

          let addedCount = 0;
          setSelectedPodcasts(prev => {
            const next = new Map(prev);
            for (const show of shows) {
              const slug = show.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
              if (!next.has(slug)) {
                next.set(slug, { name: show.name, artworkUrl: show.artworkUrl || "" });
                addedCount++;
              }
            }
            return next;
          });

          toast({
            title: "Podcasts imported!",
            description: addedCount > 0
              ? `Added ${addedCount} podcast${addedCount !== 1 ? "s" : ""} from your Spotify library.`
              : "All your Spotify podcasts were already in your picks!",
          });
        } catch {
          toast({
            title: "Import failed",
            description: "Could not import your Spotify podcasts. Please try again or search manually.",
            variant: "destructive",
          });
        }
        setImportingSpotify(false);
      })();
    }
  }, [searchString, toast]);

  const searchPodcasts = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/podcasts/search-itunes?term=${encodeURIComponent(term)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch {
      setSearchResults([]);
    }
    setIsSearching(false);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => searchPodcasts(value), 300);
  }, [searchPodcasts]);

  const toggleSelected = useCallback((slug: string, name: string, artworkUrl: string) => {
    setSelectedPodcasts(prev => {
      const next = new Map(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.set(slug, { name, artworkUrl });
      }
      return next;
    });
  }, []);

  const followExternalPodcast = useCallback(async (result: SearchResult) => {
    if (!result.onPlatform && result.id) {
      try {
        await apiRequest("POST", "/api/feed/follow", {
          itunesId: result.id,
          podcastName: result.name,
          artworkUrl: result.artworkUrl,
        });
      } catch {}
    }
  }, []);

  const { isLoading: authLoading } = useQuery({ queryKey: ["/api/auth/me"] });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/register");
    }
  }, [authLoading, user, navigate]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7FC] dark:bg-[#08080F]">
        <Loader2 className="w-6 h-6 animate-spin text-[#6366F1]" />
      </div>
    );
  }

  const isSearchActive = searchQuery.trim().length >= 2;
  const hasSelections = selectedPodcasts.size > 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F]" data-testid="onboarding-page">
      <a href="#onboarding-search-input" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#6366F1] focus:text-white focus:rounded-[9px] focus:text-[16px] focus:font-semibold" data-testid="link-skip-to-search">
        Skip to search
      </a>

      <header className="sticky top-0 z-50 flex-shrink-0 bg-white/[0.88] dark:bg-[#09090B]/[0.88] backdrop-blur-[12px] border-b border-[#F0F0F2] dark:border-[#1C1C22] h-14" role="banner">
        <div className="max-w-[680px] mx-auto px-6 sm:px-6 h-14 flex items-center">
          <PodRiseWordmark />
        </div>
      </header>

      <main className="flex-1 flex flex-col" role="main">
        <motion.div
          key="onboarding"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-[680px] mx-auto px-5 min-[600px]:px-6 pt-8 min-[600px]:pt-11 pb-[130px] min-[600px]:pb-[140px]"
        >
          <div className="mb-8">
            <h1 className="text-[26px] min-[600px]:text-[30px] font-bold text-[#09090B] dark:text-white leading-[1.2] tracking-[-0.04em]" data-testid="onboarding-search-heading">
              What podcasts do you listen to?
            </h1>
            <p className="mt-2 text-[16px] text-[#71717A] dark:text-[#A1A1AA] leading-[1.65]" data-testid="onboarding-subheading">
              Add your shows and we'll build your personalized feed and daily briefing.
            </p>
          </div>

          <div className="relative mb-[10px]">
            <Search className="absolute left-[15px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#A1A1AA] pointer-events-none" aria-hidden="true" />
            <input
              id="onboarding-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="e.g. The Daily, Lex Fridman…"
              className="w-full h-[52px] pl-12 pr-12 text-[16px] text-[#09090B] dark:text-white bg-white dark:bg-[#1C1C22] rounded-[10px] border-[1.5px] border-[#E4E4E7] dark:border-[#27272A] focus:outline-none focus:ring-[3px] focus:ring-[#6366F1]/10 focus:border-[#6366F1] placeholder:text-[#A1A1AA] transition-[border-color,box-shadow] duration-[180ms]"
              autoFocus
              autoComplete="off"
              data-testid="onboarding-search-input"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                className="absolute right-[6px] top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-[#A1A1AA] hover:text-[#52525B] dark:hover:text-white rounded-[8px] transition-colors focus:outline-none focus:ring-[3px] focus:ring-[#6366F1]"
                aria-label="Clear search"
                data-testid="onboarding-clear-search"
              >
                <X className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
          </div>

          {spotifyStatus?.configured && (
            <button
              onClick={() => { window.location.href = "/api/auth/spotify?return_to=/onboarding"; }}
              disabled={importingSpotify}
              className="flex items-center justify-center gap-2 w-full h-[44px] rounded-[10px] border-[1.5px] border-[#1DB954]/20 bg-[#1DB954]/[0.07] hover:bg-[#1DB954]/[0.12] hover:border-[#1DB954]/[0.35] text-[#1DB954] font-semibold text-[14px] transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-[3px] focus:ring-[#6366F1] focus:ring-offset-[3px] mb-7"
              data-testid="onboarding-spotify-import"
            >
              {importingSpotify ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importing from Spotify...
                </>
              ) : (
                <>
                  <SiSpotify className="w-4 h-4" />
                  Import from Spotify
                </>
              )}
            </button>
          )}

          {!spotifyStatus?.configured && <div className="mb-7" />}

          {importingSpotify && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-[#1DB954]" />
            </div>
          )}

          <AnimatePresence mode="wait">
            {hasSelections && (
              <motion.div
                key="picks-tray"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="mb-7 overflow-hidden"
              >
                <p className="font-mono text-[11px] font-medium tracking-[0.1em] uppercase text-[#6366F1] mb-[10px]" data-testid="text-your-picks">
                  Your picks ({selectedPodcasts.size})
                </p>
                <div className="flex flex-wrap gap-[6px]">
                  {Array.from(selectedPodcasts.entries()).map(([slug, info]) => (
                    <motion.div
                      key={slug}
                      initial={{ opacity: 0, scale: 0.88 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.88 }}
                      transition={{ duration: 0.18 }}
                      className="flex items-center gap-[7px] bg-white dark:bg-[#1C1C22] border border-[#E4E4E7] dark:border-[#27272A] rounded-full py-[5px] pl-[6px] pr-[8px] text-[13px] font-medium text-[#09090B] dark:text-white"
                    >
                      <div className="w-[22px] h-[22px] rounded-full overflow-hidden flex-shrink-0 bg-[#EEF2FF] dark:bg-[#1e1b4b]">
                        {info.artworkUrl ? (
                          <img src={hiResArtwork(info.artworkUrl)} alt={info.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Podcast className="w-3 h-3 text-[#6366F1]" />
                          </div>
                        )}
                      </div>
                      <span className="max-w-[130px] truncate">{info.name}</span>
                      <button
                        onClick={() => toggleSelected(slug, info.name, info.artworkUrl)}
                        className="w-[18px] h-[18px] flex items-center justify-center text-[#A1A1AA] hover:text-[#09090B] hover:bg-[#F7F7FC] dark:hover:text-white dark:hover:bg-[#27272A] rounded-full flex-shrink-0 transition-colors"
                        aria-label={`Remove ${info.name}`}
                        data-testid={`onboarding-remove-pick-${slug}`}
                      >
                        <X className="w-[10px] h-[10px]" strokeWidth={2.5} />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {isSearching && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-[#6366F1]" />
            </div>
          )}

          {isSearchActive && !isSearching && searchResults.length === 0 && (
            <div className="text-center py-8">
              <p className="text-[14px] text-[#A1A1AA]">No podcasts found. Try another search!</p>
            </div>
          )}

          {isSearchActive && searchResults.length > 0 && (
            <div>
              <p className="font-mono text-[11px] font-medium tracking-[0.1em] uppercase text-[#6366F1] mb-[10px]">Results</p>
              <div className="bg-white dark:bg-[#111114] border border-[#F0F0F2] dark:border-[#27272A] rounded-[12px] overflow-hidden mb-7">
                {searchResults.map((result) => {
                  const resultSlug = result.slug || result.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                  const isSelected = selectedPodcasts.has(resultSlug);
                  return (
                    <PodcastRow
                      key={result.id}
                      slug={resultSlug}
                      name={result.name}
                      artworkUrl={result.artworkUrl}
                      meta={result.artistName || result.genre || ""}
                      isSelected={isSelected}
                      onToggle={() => {
                        toggleSelected(resultSlug, result.name, result.artworkUrl);
                        followExternalPodcast(result);
                      }}
                      testId={`onboarding-search-result-${result.id}`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {!isSearchActive && !importingSpotify && (
            <div>
              <p className="font-mono text-[11px] font-medium tracking-[0.1em] uppercase text-[#6366F1] mb-[10px]" data-testid="text-staff-picks">Staff picks</p>
              {staffPicksLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-[#6366F1]" />
                </div>
              ) : staffPicks.length > 0 ? (
                <div className="bg-white dark:bg-[#111114] border border-[#F0F0F2] dark:border-[#27272A] rounded-[12px] overflow-hidden mb-7" data-testid="staff-picks-list">
                  {staffPicks.map((pick) => {
                    const isSelected = selectedPodcasts.has(pick.slug);
                    return (
                      <PodcastRow
                        key={pick.slug}
                        slug={pick.slug}
                        name={pick.name}
                        artworkUrl={pick.artworkUrl}
                        meta={pick.category || ""}
                        isSelected={isSelected}
                        onToggle={() => toggleSelected(pick.slug, pick.name, pick.artworkUrl)}
                        testId={`onboarding-staff-pick-${pick.slug}`}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-[14px] text-[#A1A1AA] dark:text-[#71717A]">Search above or import from Spotify to get started</p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-50 bg-white/[0.94] dark:bg-[#09090B]/[0.94] backdrop-blur-[14px] border-t border-[#F0F0F2] dark:border-[#1C1C22] px-6 pt-[14px] pb-[max(14px,env(safe-area-inset-bottom))]" role="contentinfo">
        <div className="max-w-[680px] mx-auto">
          <button
            onClick={() => completeMutation.mutate()}
            disabled={!hasSelections || completeMutation.isPending}
            className={`w-full h-[52px] flex items-center justify-center gap-2 rounded-[10px] font-bold text-[16px] tracking-[-0.01em] transition-all focus:outline-none focus:ring-[3px] focus:ring-[#6366F1] focus:ring-offset-[3px] ${
              hasSelections && !completeMutation.isPending
                ? "bg-[#6366F1] text-white hover:bg-[#4F46E5] hover:-translate-y-[1px] hover:shadow-[0_4px_18px_rgba(99,102,241,0.28)] active:translate-y-0 active:shadow-none cursor-pointer"
                : "bg-[#E4E4E7] dark:bg-[#27272A] text-[#A1A1AA] dark:text-[#52525B] cursor-not-allowed"
            }`}
            data-testid="onboarding-finish"
          >
            {completeMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Setting up your feed…
              </>
            ) : hasSelections ? (
              `Finish setup — ${selectedPodcasts.size} pick${selectedPodcasts.size !== 1 ? "s" : ""}`
            ) : (
              "Add a podcast to continue"
            )}
          </button>
          <button
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
            className="w-full mt-1 text-center text-[14px] font-medium text-[#52525B] dark:text-[#A1A1AA] hover:text-[#09090B] dark:hover:text-white transition-colors py-2 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-[3px] focus:ring-[#6366F1] focus:ring-offset-[3px] rounded-[9px]"
            data-testid="onboarding-no-podcasts"
          >
            I don't currently listen to podcasts
          </button>
        </div>
      </footer>
    </div>
  );
}
