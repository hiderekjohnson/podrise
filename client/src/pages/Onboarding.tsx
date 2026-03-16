import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, ChevronRight, ChevronLeft, Search, Podcast, Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PodCapWordmark } from "@/components/PodCapHeader";

interface SearchResult {
  id: string;
  name: string;
  artistName: string;
  artworkUrl: string;
  slug: string;
}

interface SuggestedPodcast {
  slug: string;
  name: string;
  artworkUrl: string;
  category: string | null;
  description: string | null;
  followers: number | null;
}

interface SuggestionsData {
  podcasts: SuggestedPodcast[];
  followedSlugs: string[];
  followedTopics: {
    industries: string[];
    interests: string[];
    roles: string[];
  };
  context: string;
  needsOnboarding: boolean;
}

function hiResArtwork(url: string): string {
  if (!url) return "";
  if (url.startsWith("/artwork/")) return url;
  return url.replace(/\/\d+x\d+bb\./, "/100x100bb.");
}

export default function Onboarding() {
  const { data: user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedPodcasts, setSelectedPodcasts] = useState<Map<string, { name: string; artworkUrl: string }>>(new Map());

  useEffect(() => {
    document.title = "Set Up Your Feed | PodCap";
  }, []);

  const { data: suggestions, isLoading: suggestionsLoading } = useQuery<SuggestionsData>({
    queryKey: ["/api/onboarding/suggestions"],
    queryFn: async () => {
      const res = await fetch("/api/onboarding/suggestions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load suggestions");
      return res.json();
    },
    enabled: !!user,
  });

  const [suggestedFollowed, setSuggestedFollowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (suggestions?.followedSlugs) {
      setSuggestedFollowed(new Set(suggestions.followedSlugs));
    }
  }, [suggestions]);

  useEffect(() => {
    if (user && user.onboardingCompleted) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      const allSlugs = [
        ...Array.from(selectedPodcasts.keys()),
        ...Array.from(suggestedFollowed),
      ];
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

  const searchPodcasts = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/podcasts/search?term=${encodeURIComponent(term)}`);
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

  const toggleSuggested = useCallback((slug: string) => {
    setSuggestedFollowed(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  const { isLoading: authLoading } = useQuery({ queryKey: ["/api/auth/me"] });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/register");
    }
  }, [authLoading, user, navigate]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#09090B]">
        <Loader2 className="w-6 h-6 animate-spin text-[#6366F1]" />
      </div>
    );
  }

  const totalSteps = 2;
  const progress = ((step + 1) / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-white dark:bg-[#09090B]" data-testid="onboarding-page">
      <header className="sticky top-0 z-40 bg-white dark:bg-[#09090B] border-b border-[#F0F0F2] dark:border-[#1C1C22]">
        <div className="max-w-4xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between">
          <PodCapWordmark />
          <button
            onClick={() => completeMutation.mutate()}
            className="text-[15px] font-semibold text-[#A1A1AA] hover:text-[#52525B] dark:hover:text-white transition-colors"
            data-testid="onboarding-skip"
          >
            Skip
          </button>
        </div>
        <div className="h-1 bg-[#F0F0F2] dark:bg-[#1C1C22]">
          <motion.div
            className="h-full bg-[#6366F1] rounded-r-full"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 md:px-8">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="search"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <div className="pt-8 md:pt-12 pb-4 md:pb-6 max-w-2xl mx-auto text-center">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#EEF2FF] dark:bg-[#1E1B4B] flex items-center justify-center mx-auto mb-4">
                  <Search className="w-6 h-6 md:w-7 md:h-7 text-[#6366F1]" />
                </div>
                <h1 className="text-[1.5rem] md:text-[2rem] font-bold text-[#09090B] dark:text-white leading-tight" data-testid="onboarding-search-heading">
                  What podcasts do you listen to?
                </h1>
                <p className="text-[15px] md:text-[17px] text-[#71717A] dark:text-[#A1A1AA] mt-2 max-w-lg mx-auto">
                  Search for podcasts you already enjoy. We'll use your picks to build your personalized feed.
                </p>
              </div>

              <div className="max-w-2xl mx-auto">
                <div className="relative mb-4">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#A1A1AA]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Search for a podcast..."
                    className="w-full h-[52px] md:h-[56px] pl-12 pr-4 text-[16px] md:text-[17px] text-[#09090B] dark:text-white bg-[#F4F4F5] dark:bg-[#1C1C22] rounded-2xl border border-[#ECECEE] dark:border-[#27272A] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/30 focus:border-[#6366F1]/40 placeholder:text-[#A1A1AA]"
                    autoFocus
                    data-testid="onboarding-search-input"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-[#52525B]"
                      data-testid="onboarding-clear-search"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {isSearching && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-[#6366F1]" />
                  </div>
                )}

                {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-[15px] text-[#A1A1AA]">No podcasts found for "{searchQuery}"</p>
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div className="rounded-2xl border border-[#ECECEE] dark:border-[#27272A] overflow-hidden divide-y divide-[#F0F0F2] dark:divide-[#1C1C22] mb-4">
                    {searchResults.map((result) => {
                      const resultSlug = result.slug || result.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                      const isSelected = selectedPodcasts.has(resultSlug);
                      return (
                        <button
                          key={result.id}
                          onClick={() => {
                            toggleSelected(resultSlug, result.name, result.artworkUrl);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#FAFAFE] dark:hover:bg-[#111114] transition-colors"
                          data-testid={`onboarding-search-result-${result.id}`}
                        >
                          <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-[#1C1C22]">
                            {result.artworkUrl ? (
                              <img src={hiResArtwork(result.artworkUrl)} alt={result.name} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Podcast className="w-5 h-5 text-[#6366F1]" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-[15px] md:text-[16px] text-[#09090B] dark:text-white truncate">{result.name}</p>
                            {result.artistName && <p className="text-[13px] text-[#A1A1AA] truncate">{result.artistName}</p>}
                          </div>
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                            isSelected ? "bg-[#6366F1] text-white" : "border-2 border-[#D4D4D8] dark:border-[#3F3F46] text-transparent"
                          }`}>
                            <Check className="w-4 h-4" strokeWidth={3} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedPodcasts.size > 0 && (
                  <div className="mt-6 mb-4">
                    <h3 className="text-[13px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-3">Your picks ({selectedPodcasts.size})</h3>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(selectedPodcasts.entries()).map(([slug, info]) => (
                        <div
                          key={slug}
                          className="flex items-center gap-2 bg-[#F4F4F5] dark:bg-[#1C1C22] rounded-full pl-1 pr-3 py-1"
                        >
                          <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0">
                            {info.artworkUrl ? (
                              <img src={hiResArtwork(info.artworkUrl)} alt={info.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-[#EEF2FF] flex items-center justify-center">
                                <Podcast className="w-3.5 h-3.5 text-[#6366F1]" />
                              </div>
                            )}
                          </div>
                          <span className="text-[13px] font-medium text-[#09090B] dark:text-white truncate max-w-[120px]">{info.name}</span>
                          <button
                            onClick={() => toggleSelected(slug, info.name, info.artworkUrl)}
                            className="text-[#A1A1AA] hover:text-[#52525B] dark:hover:text-white ml-0.5"
                            data-testid={`onboarding-remove-pick-${slug}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!searchQuery && selectedPodcasts.size === 0 && suggestions && suggestions.podcasts.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-[13px] font-bold text-[#A1A1AA] uppercase tracking-wider mb-3">Popular podcasts</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-0 rounded-2xl border border-[#ECECEE] dark:border-[#27272A] overflow-hidden divide-y md:divide-y-0 divide-[#F0F0F2] dark:divide-[#1C1C22]">
                      {suggestions.podcasts.slice(0, 8).map((podcast, idx) => {
                        const isSelected = selectedPodcasts.has(podcast.slug);
                        return (
                          <button
                            key={podcast.slug}
                            onClick={() => toggleSelected(podcast.slug, podcast.name, podcast.artworkUrl)}
                            className={`flex items-center gap-3 px-4 py-3 text-left hover:bg-[#FAFAFE] dark:hover:bg-[#111114] transition-colors ${
                              idx % 2 === 0 && idx < suggestions.podcasts.length - 1 ? "md:border-r md:border-[#F0F0F2] md:dark:border-[#1C1C22]" : ""
                            } ${idx >= 2 ? "md:border-t md:border-[#F0F0F2] md:dark:border-[#1C1C22]" : ""}`}
                            data-testid={`onboarding-popular-${podcast.slug}`}
                          >
                            <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-[#1C1C22]">
                              {podcast.artworkUrl ? (
                                <img src={hiResArtwork(podcast.artworkUrl)} alt={podcast.name} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Podcast className="w-5 h-5 text-[#6366F1]" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-[14px] text-[#09090B] dark:text-white truncate">{podcast.name}</p>
                              {podcast.category && <p className="text-[12px] text-[#A1A1AA] truncate">{podcast.category}</p>}
                            </div>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                              isSelected ? "bg-[#6366F1] text-white" : "border-2 border-[#D4D4D8] dark:border-[#3F3F46] text-transparent"
                            }`}>
                              <Check className="w-3.5 h-3.5" strokeWidth={3} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="max-w-2xl mx-auto sticky bottom-0 bg-white dark:bg-[#09090B] border-t border-[#F0F0F2] dark:border-[#1C1C22] py-4 mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="w-full h-[48px] md:h-[52px] flex items-center justify-center gap-2 rounded-full font-bold text-[15px] md:text-[16px] bg-[#09090B] dark:bg-white text-white dark:text-[#09090B] hover:bg-[#1a1a2e] dark:hover:bg-[#E4E4E7] transition-all active:scale-[0.98]"
                  data-testid="onboarding-next-search"
                >
                  {selectedPodcasts.size > 0 ? `Next — ${selectedPodcasts.size} selected` : "Next"}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="suggestions"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <div className="pt-8 md:pt-12 pb-4 md:pb-6 max-w-2xl mx-auto text-center">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#EEF2FF] dark:bg-[#1E1B4B] flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-6 h-6 md:w-7 md:h-7 text-[#6366F1]" />
                </div>
                <h1 className="text-[1.5rem] md:text-[2rem] font-bold text-[#09090B] dark:text-white leading-tight" data-testid="onboarding-suggestions-heading">
                  {selectedPodcasts.size > 0 ? "You might also enjoy these" : "Popular podcasts to follow"}
                </h1>
                <p className="text-[15px] md:text-[17px] text-[#71717A] dark:text-[#A1A1AA] mt-2 max-w-lg mx-auto">
                  {selectedPodcasts.size > 0
                    ? "Based on your picks, here are some podcasts we think you'll love."
                    : "Follow podcasts to start building your personalized feed."}
                </p>
              </div>

              <div className="max-w-2xl mx-auto">
                {suggestionsLoading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-[#6366F1]" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 rounded-2xl border border-[#ECECEE] dark:border-[#27272A] overflow-hidden">
                    {(suggestions?.podcasts || []).map((podcast, idx) => {
                      const isSelected = suggestedFollowed.has(podcast.slug);
                      const cols = 2;
                      const showRightBorder = idx % cols === 0;
                      const showTopBorder = idx >= cols;
                      return (
                        <button
                          key={podcast.slug}
                          onClick={() => toggleSuggested(podcast.slug)}
                          className={`flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#FAFAFE] dark:hover:bg-[#111114] transition-colors ${
                            showRightBorder ? "md:border-r md:border-[#F0F0F2] md:dark:border-[#1C1C22]" : ""
                          } ${showTopBorder ? "border-t border-[#F0F0F2] dark:border-[#1C1C22]" : ""}`}
                          data-testid={`onboarding-suggestion-${podcast.slug}`}
                        >
                          <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-[#1C1C22]">
                            {podcast.artworkUrl ? (
                              <img src={hiResArtwork(podcast.artworkUrl)} alt={podcast.name} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Podcast className="w-5 h-5 text-[#6366F1]" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-[15px] text-[#09090B] dark:text-white truncate">{podcast.name}</p>
                            {podcast.category && <p className="text-[13px] text-[#A1A1AA] truncate">{podcast.category}</p>}
                            {podcast.description && <p className="text-[12px] text-[#71717A] dark:text-[#52525B] truncate mt-0.5 hidden md:block">{podcast.description}</p>}
                          </div>
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                            isSelected ? "bg-[#6366F1] text-white" : "border-2 border-[#D4D4D8] dark:border-[#3F3F46] text-transparent"
                          }`}>
                            <Check className="w-4 h-4" strokeWidth={3} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="max-w-2xl mx-auto sticky bottom-0 bg-white dark:bg-[#09090B] border-t border-[#F0F0F2] dark:border-[#1C1C22] py-4 mt-6">
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(0)}
                    className="h-[48px] md:h-[52px] px-6 flex items-center justify-center gap-1 rounded-full font-bold text-[15px] border border-[#D4D4D8] dark:border-[#3F3F46] text-[#09090B] dark:text-white hover:bg-[#F4F4F5] dark:hover:bg-[#1C1C22] transition-all"
                    data-testid="onboarding-back-suggestions"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={() => completeMutation.mutate()}
                    disabled={completeMutation.isPending}
                    className="flex-1 h-[48px] md:h-[52px] flex items-center justify-center gap-2 rounded-full font-bold text-[15px] md:text-[16px] bg-[#6366F1] text-white hover:bg-[#4F46E5] disabled:opacity-50 transition-all active:scale-[0.98]"
                    data-testid="onboarding-finish"
                  >
                    {completeMutation.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      `Create my feed${selectedPodcasts.size + suggestedFollowed.size > 0 ? ` — ${selectedPodcasts.size + suggestedFollowed.size} picks` : ""}`
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
