// See BRAND.md for all typography, color, spacing, and accessibility rules.
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, Search, Podcast, Sparkles, X, Plus, Headphones, Radio, Mic2 } from "lucide-react";
import { SiSpotify } from "react-icons/si";
import { motion } from "framer-motion";
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

interface RelatedPodcast {
  slug: string;
  name: string;
  artworkUrl: string;
  category: string | null;
  description: string | null;
  followers: number | null;
}

function RecommendationCard({ podcast, onAdd }: { podcast: RelatedPodcast; onAdd: (p: RelatedPodcast) => void }) {
  return (
    <button
      onClick={() => onAdd(podcast)}
      className="flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-[12px] border border-[#F0F0F2] dark:border-[#27272A] bg-white dark:bg-[#111114] hover:bg-[#F7F7FC] dark:hover:bg-[#18181B] hover:border-[#6366F1]/20 transition-all text-left focus:outline-none focus:ring-[3px] focus:ring-[#6366F1] focus:ring-offset-[3px]"
      data-testid={`onboarding-related-${podcast.slug}`}
    >
      <div className="w-10 h-10 rounded-[8px] overflow-hidden flex-shrink-0 bg-[#F7F7FC] dark:bg-[#1C1C22]">
        {podcast.artworkUrl ? (
          <img src={hiResArtwork(podcast.artworkUrl)} alt={podcast.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Podcast className="w-4 h-4 text-[#6366F1]" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[14px] text-[#09090B] dark:text-white truncate leading-[1.6]">{podcast.name}</p>
        {podcast.category && <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] truncate">{podcast.category}</p>}
      </div>
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border border-[#6366F1]/30 text-[#6366F1]">
        <Plus className="w-3.5 h-3.5" />
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 md:py-16 px-4" data-testid="onboarding-empty-state">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#6366F1]/10 to-[#8B5CF6]/10 dark:from-[#6366F1]/20 dark:to-[#8B5CF6]/20 flex items-center justify-center">
          <Headphones className="w-8 h-8 text-[#6366F1]" />
        </div>
        <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-[#8B5CF6]/10 dark:bg-[#8B5CF6]/20 flex items-center justify-center">
          <Radio className="w-3.5 h-3.5 text-[#8B5CF6]" />
        </div>
        <div className="absolute -bottom-1 -left-2 w-6 h-6 rounded-full bg-[#6366F1]/10 dark:bg-[#6366F1]/20 flex items-center justify-center">
          <Mic2 className="w-3 h-3 text-[#6366F1]" />
        </div>
      </div>
      <p className="text-[16px] text-[#52525B] dark:text-[#A1A1AA] text-center max-w-[280px] leading-[1.6]">
        Search above or import from Spotify to get started
      </p>
    </div>
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
  const [relatedPodcasts, setRelatedPodcasts] = useState<RelatedPodcast[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [importingSpotify, setImportingSpotify] = useState(false);
  const spotifyImportHandled = useRef(false);

  const { data: spotifyStatus } = useQuery<{ configured: boolean; connected: boolean }>({
    queryKey: ["/api/spotify/status"],
  });

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

  const fetchRelatedPodcasts = useCallback(async (slugs: string[]) => {
    if (slugs.length === 0) {
      setRelatedPodcasts([]);
      return;
    }
    setLoadingRelated(true);
    try {
      const res = await apiRequest("POST", "/api/onboarding/related-podcasts", { slugs });
      if (res.ok) {
        const data = await res.json();
        setRelatedPodcasts((data.podcasts || []).filter((p: RelatedPodcast) => !slugs.includes(p.slug)));
      }
    } catch {
      setRelatedPodcasts([]);
    }
    setLoadingRelated(false);
  }, []);

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
            const slugs = Array.from(next.keys());
            fetchRelatedPodcasts(slugs);
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
  }, [searchString, toast, fetchRelatedPodcasts]);

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
      const slugs = Array.from(next.keys());
      fetchRelatedPodcasts(slugs);
      return next;
    });
    setSearchQuery("");
    setSearchResults([]);
  }, [fetchRelatedPodcasts]);

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

  const addRelatedPodcast = useCallback((podcast: RelatedPodcast) => {
    setSelectedPodcasts(prev => {
      const next = new Map(prev);
      if (!next.has(podcast.slug)) {
        next.set(podcast.slug, { name: podcast.name, artworkUrl: podcast.artworkUrl });
      }
      const slugs = Array.from(next.keys());
      fetchRelatedPodcasts(slugs);
      return next;
    });
  }, [fetchRelatedPodcasts]);

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

  const showRecommendations = selectedPodcasts.size > 0;
  const showEmptyState = selectedPodcasts.size === 0 && searchQuery.length < 2 && searchResults.length === 0 && !isSearching && !importingSpotify;

  return (
    <div className="h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F] overflow-hidden" data-testid="onboarding-page">
      <a href="#onboarding-search-input" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#6366F1] focus:text-white focus:rounded-[9px] focus:text-[16px] focus:font-semibold" data-testid="link-skip-to-search">
        Skip to search
      </a>

      <header className="flex-shrink-0 z-40 bg-white/80 dark:bg-[#09090B]/80 backdrop-blur-md border-b border-[#F0F0F2] dark:border-[#1C1C22]" role="banner">
        <div className="max-w-[960px] mx-auto px-5 md:px-7 h-14 flex items-center">
          <PodRiseWordmark />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto" role="main">
        <motion.div
          key="search"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col min-h-full"
        >
          <div className="flex-1 w-full max-w-[960px] mx-auto px-5 md:px-7">
            <div className={`flex flex-col ${showRecommendations ? 'md:grid md:grid-cols-[minmax(0,640px)_minmax(0,280px)] md:gap-10' : 'max-w-[640px]'}`}>
              <div className="flex flex-col min-h-0">
                <div className="pt-8 md:pt-12 pb-2 flex-shrink-0">
                  <h1 className="text-[1.5rem] md:text-[2rem] font-semibold text-[#09090B] dark:text-white leading-[1.3]" data-testid="onboarding-search-heading">
                    What podcasts do you listen to?
                  </h1>
                  <p className="mt-2 text-[16px] text-[#52525B] dark:text-[#A1A1AA] leading-[1.6]" data-testid="onboarding-subheading">
                    Add your favorite shows so we can personalize your feed
                  </p>
                </div>

                <div className="mt-6 mb-4 flex-shrink-0">
                  <label htmlFor="onboarding-search-input" className="block text-[14px] font-medium text-[#52525B] dark:text-[#A1A1AA] mb-2">Search for a podcast</label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#A1A1AA]" aria-hidden="true" />
                    <input
                      id="onboarding-search-input"
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder="e.g. The Daily, Lex Fridman..."
                      className="w-full h-[52px] pl-12 pr-4 text-[16px] text-[#09090B] dark:text-white bg-white dark:bg-[#1C1C22] rounded-[8px] border border-[#E4E4E7] dark:border-[#27272A] focus:outline-none focus:ring-[3px] focus:ring-[#6366F1] focus:ring-offset-[3px] focus:border-[#6366F1] placeholder:text-[#A1A1AA]"
                      autoFocus
                      data-testid="onboarding-search-input"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-[44px] h-[44px] flex items-center justify-center text-[#A1A1AA] hover:text-[#52525B] dark:hover:text-white focus:outline-none focus:ring-[3px] focus:ring-[#6366F1] focus:ring-offset-[3px] rounded-[8px]"
                        aria-label="Clear search"
                        data-testid="onboarding-clear-search"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>

                {spotifyStatus?.configured && (
                  <div className="mb-4 flex-shrink-0">
                    <button
                      onClick={() => { window.location.href = "/api/auth/spotify?return_to=/onboarding"; }}
                      disabled={importingSpotify}
                      className="flex items-center justify-center gap-2 w-full h-[44px] rounded-[9px] border border-[#E4E4E7] dark:border-[#27272A] bg-[#1DB954]/10 hover:bg-[#1DB954]/20 text-[#1DB954] font-semibold text-[15px] transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-[3px] focus:ring-[#6366F1] focus:ring-offset-[3px]"
                      data-testid="onboarding-spotify-import"
                    >
                      {importingSpotify ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Importing from Spotify...
                        </>
                      ) : (
                        <>
                          <SiSpotify className="w-4.5 h-4.5" />
                          Import from Spotify
                        </>
                      )}
                    </button>
                  </div>
                )}

                {importingSpotify && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-[#1DB954]" />
                  </div>
                )}

                {isSearching && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-[#6366F1]" />
                  </div>
                )}

                {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-[16px] text-[#52525B] dark:text-[#A1A1AA]">No podcasts found. Try another search!</p>
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div className="rounded-[12px] border border-[#F0F0F2] dark:border-[#27272A] overflow-hidden divide-y divide-[#F0F0F2] dark:divide-[#1C1C22] mb-4 flex-shrink-0 max-h-[260px] overflow-y-auto bg-white dark:bg-[#111114]">
                    {searchResults.map((result) => {
                      const resultSlug = result.slug || result.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                      const isSelected = selectedPodcasts.has(resultSlug);
                      return (
                        <button
                          key={result.id}
                          onClick={() => {
                            toggleSelected(resultSlug, result.name, result.artworkUrl);
                            followExternalPodcast(result);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] text-left hover:bg-[#F7F7FC] dark:hover:bg-[#18181B] transition-colors focus:outline-none focus:ring-[3px] focus:ring-[#6366F1] focus:ring-offset-[3px]"
                          data-testid={`onboarding-search-result-${result.id}`}
                        >
                          <div className="w-12 h-12 rounded-[8px] overflow-hidden flex-shrink-0 bg-[#F7F7FC] dark:bg-[#1C1C22]">
                            {result.artworkUrl ? (
                              <img src={hiResArtwork(result.artworkUrl)} alt={result.name} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Podcast className="w-5 h-5 text-[#6366F1]" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-[16px] text-[#09090B] dark:text-white truncate leading-[1.6]">{result.name}</p>
                            <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] truncate">
                              {result.artistName || result.genre || ""}
                            </p>
                          </div>
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                            isSelected ? "bg-[#6366F1] text-white" : "border-2 border-[#E4E4E7] dark:border-[#3F3F46] text-transparent"
                          }`}>
                            <Check className="w-4 h-4" strokeWidth={3} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {showEmptyState && <EmptyState />}

                {selectedPodcasts.size > 0 && (
                  <div className="mb-4 flex-shrink-0 overflow-y-auto max-h-[200px] md:max-h-none md:flex-1 md:min-h-0">
                    <h3 className="text-[14px] font-bold text-[#52525B] dark:text-[#A1A1AA] uppercase tracking-wider mb-3 sticky top-0 bg-[#F7F7FC] dark:bg-[#08080F] py-1" data-testid="text-your-picks">Your picks ({selectedPodcasts.size})</h3>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(selectedPodcasts.entries()).map(([slug, info]) => (
                        <div
                          key={slug}
                          className="flex items-center gap-2 bg-white dark:bg-[#1C1C22] border border-[#F0F0F2] dark:border-[#27272A] rounded-full pl-1 pr-3 py-1"
                        >
                          <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
                            {info.artworkUrl ? (
                              <img src={hiResArtwork(info.artworkUrl)} alt={info.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-[#EEF2FF] dark:bg-[#1C1C22] flex items-center justify-center">
                                <Podcast className="w-3.5 h-3.5 text-[#6366F1]" />
                              </div>
                            )}
                          </div>
                          <span className="text-[14px] font-medium text-[#09090B] dark:text-white truncate max-w-[140px]">{info.name}</span>
                          <button
                            onClick={() => toggleSelected(slug, info.name, info.artworkUrl)}
                            className="w-[44px] h-[44px] -mr-3 flex items-center justify-center text-[#A1A1AA] hover:text-[#52525B] dark:hover:text-white focus:outline-none focus:ring-[3px] focus:ring-[#6366F1] rounded-full"
                            aria-label={`Remove ${info.name}`}
                            data-testid={`onboarding-remove-pick-${slug}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {showRecommendations && (
                  <div className="mt-4 mb-4 md:hidden overflow-y-auto">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-[#6366F1]" />
                      <h3 className="text-[14px] font-bold text-[#52525B] dark:text-[#A1A1AA] uppercase tracking-wider">You might also listen to...</h3>
                    </div>
                    {loadingRelated ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="w-5 h-5 animate-spin text-[#6366F1]" />
                      </div>
                    ) : relatedPodcasts.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {relatedPodcasts.filter(p => !selectedPodcasts.has(p.slug)).slice(0, 6).map((podcast) => (
                          <RecommendationCard key={podcast.slug} podcast={podcast} onAdd={addRelatedPodcast} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {showRecommendations && (
                <div className="hidden md:flex flex-col min-h-0 pt-8 md:pt-12">
                  <div className="flex items-center gap-2 mb-4 flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-[#6366F1]" />
                    <h3 className="text-[14px] font-bold text-[#52525B] dark:text-[#A1A1AA] uppercase tracking-wider">You might also listen to...</h3>
                  </div>
                  {loadingRelated ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-[#6366F1]" />
                    </div>
                  ) : relatedPodcasts.length > 0 ? (
                    <div className="flex-1 overflow-y-auto min-h-0">
                      <div className="grid grid-cols-1 gap-2">
                        {relatedPodcasts.filter(p => !selectedPodcasts.has(p.slug)).slice(0, 8).map((podcast) => (
                          <RecommendationCard key={podcast.slug} podcast={podcast} onAdd={addRelatedPodcast} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 sticky bottom-0 md:static bg-white/90 dark:bg-[#09090B]/90 md:bg-transparent md:dark:bg-transparent backdrop-blur-md md:backdrop-blur-none border-t border-[#F0F0F2] dark:border-[#1C1C22] py-4 px-5 md:px-7 pb-[max(16px,env(safe-area-inset-bottom))] md:pb-4">
            <div className="max-w-[640px] mx-auto md:mx-0">
              <button
                onClick={() => completeMutation.mutate()}
                disabled={completeMutation.isPending}
                className="w-full h-[48px] flex items-center justify-center gap-2 rounded-[9px] font-semibold text-[15px] bg-[#6366F1] text-white hover:bg-[#4F46E5] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] focus:outline-none focus:ring-[3px] focus:ring-[#6366F1] focus:ring-offset-[3px]"
                style={{ padding: '12px 22px' }}
                data-testid="onboarding-finish"
              >
                {completeMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  selectedPodcasts.size > 0 ? `Finish setup — ${selectedPodcasts.size} picks` : "Finish setup"
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
          </div>
        </motion.div>
      </main>
    </div>
  );
}
