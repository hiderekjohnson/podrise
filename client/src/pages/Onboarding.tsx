import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, Podcast, X } from "lucide-react";
import { SiSpotify } from "react-icons/si";
import { motion, AnimatePresence } from "framer-motion";
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

const MIN_PICKS = 5;

function getMicrocopy(n: number): { text: string; positive: boolean } {
  if (n === 0) return { text: "Add 5 podcasts to unlock your feed", positive: false };
  if (n === 1) return { text: "Good start — <strong>4 more</strong> to go", positive: false };
  if (n === 2) return { text: "Nice. <strong>3 more</strong> and your feed unlocks", positive: false };
  if (n === 3) return { text: "Almost halfway — <strong>2 more</strong>", positive: false };
  if (n === 4) return { text: "One more and you're in", positive: false };
  if (n <= 7) return { text: "Keep going — more shows = smarter briefings", positive: true };
  if (n <= 9) return { text: "Your briefing is shaping up nicely", positive: true };
  if (n <= 12) return { text: "This is a seriously good feed", positive: true };
  if (n <= 15) return { text: "Almost a perfect starting feed", positive: true };
  return { text: "A great feed. You can always add more later.", positive: true };
}

function getProgressPercent(n: number): number {
  if (n === 0) return 0;
  return Math.min(96, 100 * (1 - Math.exp(-n / 8)));
}

function CtaButton({ count, isPending, onClick, testId }: { count: number; isPending: boolean; onClick: () => void; testId: string }) {
  const isReady = count >= MIN_PICKS;
  const t = isReady ? Math.min((count - MIN_PICKS) / 5, 1) : 0;
  const opacity = isReady ? 0.45 + t * 0.55 : 1;

  return (
    <button
      onClick={onClick}
      disabled={!isReady || isPending}
      className={`flex-shrink-0 w-full h-[44px] flex items-center justify-center rounded-[10px] font-semibold text-[14px] tracking-[-0.01em] transition-all relative overflow-hidden ${
        isReady
          ? "text-white hover:-translate-y-[1px] active:translate-y-0 cursor-pointer"
          : "bg-[#E4E4E7] dark:bg-[#27272A] text-[#A1A1AA] dark:text-[#52525B] cursor-not-allowed"
      }`}
      style={isReady ? {
        background: `linear-gradient(135deg, rgba(99,102,241,${opacity}), rgba(139,92,246,${opacity}))`,
      } : undefined}
      data-testid={testId}
    >
      {isPending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Setting up…
        </>
      ) : isReady ? "Build my Recap →" : "Build my Recap"}
    </button>
  );
}

function PodcastRow({
  name,
  artworkUrl,
  meta,
  isSelected,
  onToggle,
  testId,
}: {
  name: string;
  artworkUrl: string;
  meta: string;
  isSelected: boolean;
  onToggle: () => void;
  testId: string;
}) {
  return (
    <div
      onClick={onToggle}
      className="flex items-center gap-3 py-2 px-2.5 rounded-lg cursor-pointer transition-colors hover:bg-[#F7F7FC] dark:hover:bg-[#18181B] select-none"
      data-testid={testId}
    >
      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-[#F7F7FC] dark:bg-[#1C1C22]">
        {artworkUrl ? (
          <img src={hiResArtwork(artworkUrl)} alt={name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Podcast className="w-5 h-5 text-[#6366F1]" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-[#09090B] dark:text-white truncate mb-[1px] leading-snug">{name}</p>
        <p className="text-[12px] text-[#A1A1AA] dark:text-[#71717A] truncate">{meta}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`flex-shrink-0 h-[30px] px-4 rounded-md text-[12px] font-semibold tracking-[0.03em] transition-all border ${
          isSelected
            ? "bg-[#F0FDF4] text-[#15803d] border-[#BBF7D0] cursor-default"
            : "bg-[#EEF2FF] text-[#6366F1] border-[#6366F1]/20 hover:bg-[#6366F1] hover:text-white hover:border-[#6366F1]"
        }`}
        data-testid={`${testId}-btn`}
      >
        {isSelected ? "ADDED" : "ADD"}
      </button>
    </div>
  );
}

function SelectedSlot({
  name,
  artworkUrl,
  onRemove,
}: {
  name: string;
  artworkUrl: string;
  onRemove: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
      className="group flex items-center gap-2 px-2.5 py-2 bg-white dark:bg-[#1C1C22] border border-[#6366F1]/15 dark:border-[#6366F1]/25 rounded-[9px] min-h-[44px] flex-shrink-0"
    >
      <div className="w-8 h-8 rounded-md overflow-hidden flex-shrink-0 bg-[#EEF2FF] dark:bg-[#1e1b4b] flex items-center justify-center">
        {artworkUrl ? (
          <img src={hiResArtwork(artworkUrl)} alt={name} className="w-full h-full object-cover" />
        ) : (
          <Podcast className="w-3.5 h-3.5 text-[#6366F1]" />
        )}
      </div>
      <span className="flex-1 text-[13px] font-medium text-[#09090B] dark:text-white truncate">{name}</span>
      <button
        onClick={onRemove}
        className="flex-shrink-0 w-[18px] h-[18px] rounded flex items-center justify-center text-[#A1A1AA] opacity-0 group-hover:opacity-100 hover:bg-[#FEE2E2] hover:text-[#DC2626] transition-all"
        aria-label={`Remove ${name}`}
      >
        <X className="w-[10px] h-[10px]" strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}

function EmptySlot({ onClick }: { onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 px-2.5 py-2 border-[1.5px] border-dashed border-[#E4E4E7] dark:border-[#3F3F46] rounded-[9px] min-h-[44px] flex-shrink-0 cursor-pointer hover:border-[#A5B4FC] dark:hover:border-[#6366F1]/40 hover:bg-[#6366F1]/[0.02] transition-colors"
    >
      <div className="w-8 h-8 rounded-md bg-[#F0F0F2] dark:bg-[#27272A] flex-shrink-0" />
      <span className="text-[12px] text-[#A1A1AA] italic">Add another…</span>
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="w-full h-[6px] bg-[#E4E4E7] dark:bg-[#27272A] rounded-full overflow-hidden">
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-[#6366F1] to-[#8B5CF6]"
        initial={{ width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={{ type: "spring", damping: 20, stiffness: 200 }}
      />
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
  const [importingSpotify, setImportingSpotify] = useState(false);
  const spotifyImportHandled = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const searchAreaRef = useRef<HTMLDivElement>(null);
  const selectedListRef = useRef<HTMLDivElement>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const isPreview = new URLSearchParams(window.location.search).has("preview");

  const { data: spotifyStatus } = useQuery<{ configured: boolean; connected: boolean }>({
    queryKey: ["/api/spotify/status"],
    enabled: !isPreview,
  });

  const showSpotify = isPreview || spotifyStatus?.configured;

  const { data: staffPicksData, isLoading: staffPicksLoading } = useQuery<{ podcasts: StaffPick[] }>({
    queryKey: ["/api/onboarding/suggestions"],
  });

  const allStaffPicks = staffPicksData?.podcasts || [];

  const VISIBLE_PICK_COUNT = 6;
  const visiblePicks = allStaffPicks.filter(p => !selectedPodcasts.has(p.slug)).slice(0, VISIBLE_PICK_COUNT);

  useEffect(() => {
    document.title = "Set Up Your Feed | PodRise";
  }, []);

  useEffect(() => {
    if (user && user.onboardingCompleted && !isPreview) {
      navigate("/dashboard");
    }
  }, [user, navigate, isPreview]);

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
      setShowSearchOverlay(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/podcasts/search-itunes?term=${encodeURIComponent(term)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
        setShowSearchOverlay(true);
      }
    } catch {
      setSearchResults([]);
    }
    setIsSearching(false);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.trim().length < 2) {
      setSearchResults([]);
      setShowSearchOverlay(false);
    } else {
      searchTimerRef.current = setTimeout(() => searchPodcasts(value), 300);
    }
  }, [searchPodcasts]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchOverlay(false);
  }, []);

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchAreaRef.current && !searchAreaRef.current.contains(e.target as Node)) {
        setShowSearchOverlay(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedListRef.current) {
      selectedListRef.current.scrollTop = selectedListRef.current.scrollHeight;
    }
  }, [selectedPodcasts.size]);

  const { isLoading: authLoading } = useQuery({ queryKey: ["/api/auth/me"] });

  useEffect(() => {
    if (!authLoading && !user && !isPreview) {
      navigate("/register");
    }
  }, [authLoading, user, navigate, isPreview]);

  if (!user && !isPreview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7FC] dark:bg-[#08080F]">
        <Loader2 className="w-6 h-6 animate-spin text-[#6366F1]" />
      </div>
    );
  }

  const count = selectedPodcasts.size;
  const isReady = count >= MIN_PICKS;
  const mc = getMicrocopy(count);
  const progressPercent = getProgressPercent(count);
  const isSearchActive = searchQuery.trim().length >= 2;

  const rightPanel = (
    <>
      <div className="flex items-baseline justify-between mb-2.5 flex-shrink-0">
        <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#A1A1AA]">Your Feed</span>
        <span className="text-[12px] font-semibold text-[#6366F1] tabular-nums" data-testid="text-feed-count">{count} added</span>
      </div>

      <div ref={selectedListRef} className="flex-1 min-h-0 overflow-y-auto space-y-1 mb-3 scrollbar-thin scrollbar-thumb-[#E4E4E7] dark:scrollbar-thumb-[#3F3F46]">
        <AnimatePresence mode="popLayout">
          {Array.from(selectedPodcasts.entries()).map(([slug, info]) => (
            <SelectedSlot
              key={slug}
              name={info.name}
              artworkUrl={info.artworkUrl}
              onRemove={() => toggleSelected(slug, info.name, info.artworkUrl)}
            />
          ))}
        </AnimatePresence>
        <EmptySlot onClick={() => searchInputRef.current?.focus()} />
      </div>

      <div className="flex-shrink-0 space-y-2.5 mb-3">
        <ProgressBar percent={progressPercent} />
        <p
          className={`text-[11px] leading-[1.4] min-h-[16px] transition-colors ${mc.positive ? "text-[#6366F1]" : "text-[#A1A1AA]"}`}
          dangerouslySetInnerHTML={{ __html: mc.text }}
          data-testid="text-microcopy"
        />
      </div>

      <CtaButton
        count={count}
        isPending={completeMutation.isPending}
        onClick={() => completeMutation.mutate()}
        testId="onboarding-finish"
      />
      <p className="text-center text-[10px] text-[#A1A1AA] mt-[7px] flex-shrink-0 min-h-[14px]" data-testid="text-cta-sub">
        {isReady
          ? "Or keep adding for smarter briefings"
          : `Add ${MIN_PICKS - count} more to continue`}
      </p>
    </>
  );

  return (
    <div className="h-screen flex flex-col bg-[#F7F7FC] dark:bg-[#08080F] overflow-hidden" data-testid="onboarding-page">

      <div className="flex-shrink-0 px-5 sm:px-8 py-4">
        <a href="/" className="block w-fit no-underline">
          <img src="/logo-transparent.svg" alt="PodRise" className="h-10 w-auto object-contain" />
        </a>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col items-center px-4 sm:px-6 pb-0 md:pb-4">

        <div className="w-full max-w-[860px] flex-1 min-h-0 overflow-hidden border border-[#F0F0F2] dark:border-[#27272A] rounded-xl grid grid-cols-1 md:grid-cols-[1fr_280px]">

          <div className="flex flex-col px-5 sm:px-7 pt-5 sm:pt-6 pb-4 overflow-hidden md:border-r border-[#F0F0F2] dark:border-[#27272A] bg-white dark:bg-[#111114] rounded-t-xl md:rounded-tr-none md:rounded-l-xl">
            <h1 className="text-[22px] font-bold tracking-[-0.03em] text-[#09090B] dark:text-white mb-1 flex-shrink-0" data-testid="onboarding-search-heading">
              What podcasts do you listen to?
            </h1>
            <p className="text-[14px] text-[#71717A] dark:text-[#A1A1AA] mb-4 leading-[1.5] flex-shrink-0" data-testid="onboarding-subheading">
              Add your shows and we'll build you the ultimate daily recap.
            </p>

            <div ref={searchAreaRef} className="flex-shrink-0 relative z-10 mb-4">
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-[#A1A1AA] pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    id="onboarding-search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="e.g. The Daily, Lex Fridman…"
                    className="w-full h-10 pl-[36px] pr-[34px] text-[14px] text-[#09090B] dark:text-white bg-[#F7F7FC] dark:bg-[#1C1C22] rounded-[9px] border-[1.5px] border-[#E4E4E7] dark:border-[#27272A] outline-none transition-all focus:border-[#6366F1] focus:shadow-[0_0_0_3px_rgba(99,102,241,0.1)] focus:bg-white dark:focus:bg-[#111114] placeholder:text-[#A1A1AA]"
                    autoComplete="off"
                    data-testid="onboarding-search-input"
                  />
                  {searchQuery && (
                    <button
                      onClick={clearSearch}
                      className="absolute right-[10px] top-1/2 -translate-y-1/2 w-[17px] h-[17px] rounded-full bg-[#A1A1AA] hover:bg-[#52525B] text-white flex items-center justify-center text-[9px] transition-colors"
                      aria-label="Clear search"
                      data-testid="onboarding-clear-search"
                    >
                      <X className="w-[9px] h-[9px]" strokeWidth={3} />
                    </button>
                  )}
                </div>
                {showSpotify && (
                  <button
                    onClick={() => { window.location.href = "/api/auth/spotify?return_to=/onboarding"; }}
                    disabled={importingSpotify}
                    className="flex items-center gap-[6px] h-10 px-3.5 bg-white dark:bg-[#1C1C22] border-[1.5px] border-[#E4E4E7] dark:border-[#27272A] rounded-[9px] text-[12px] font-medium text-[#52525B] dark:text-[#A1A1AA] whitespace-nowrap transition-colors hover:border-[#1DB954] hover:bg-[#f0faf2] dark:hover:bg-[#1DB954]/10 hover:text-[#15803d] disabled:opacity-50 flex-shrink-0"
                    data-testid="onboarding-spotify-import"
                  >
                    {importingSpotify ? (
                      <Loader2 className="w-[14px] h-[14px] animate-spin" />
                    ) : (
                      <div className="w-[14px] h-[14px] bg-[#1DB954] rounded-full flex items-center justify-center flex-shrink-0">
                        <SiSpotify className="w-[8px] h-[8px] text-white" />
                      </div>
                    )}
                    <span className="hidden sm:inline">Import from Spotify</span>
                    <span className="sm:hidden">Spotify</span>
                  </button>
                )}
              </div>

              {showSearchOverlay && isSearchActive && (
                <div className="absolute top-[calc(100%+5px)] left-0 right-0 bg-white dark:bg-[#111114] border-[1.5px] border-[#6366F1] rounded-[11px] shadow-[0_8px_32px_rgba(99,102,241,0.13),0_2px_8px_rgba(0,0,0,0.06)] z-[100] max-h-[300px] overflow-y-auto p-[5px]">
                  <div className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#A1A1AA] px-[10px] py-[7px] pb-[3px]">
                    {isSearching ? "Searching…" : searchResults.length === 0 ? "No results" : `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}`}
                  </div>
                  {isSearching && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin text-[#6366F1]" />
                    </div>
                  )}
                  {!isSearching && searchResults.length === 0 && (
                    <div className="px-[10px] py-3 text-[13px] text-[#A1A1AA]">No podcasts found for "{searchQuery}"</div>
                  )}
                  {!isSearching && searchResults.map((result) => {
                    const resultSlug = result.slug || result.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                    const isSelected = selectedPodcasts.has(resultSlug);
                    return (
                      <PodcastRow
                        key={result.id}
                        name={result.name}
                        artworkUrl={result.artworkUrl}
                        meta={result.artistName || result.genre || ""}
                        isSelected={isSelected}
                        onToggle={() => {
                          toggleSelected(resultSlug, result.name, result.artworkUrl);
                          followExternalPodcast(result);
                          clearSearch();
                        }}
                        testId={`onboarding-search-result-${result.id}`}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            <div className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#A1A1AA] mb-1 flex-shrink-0" data-testid="text-staff-picks">
              {count > 0 ? "Suggested for you" : "Staff Picks"}
            </div>
            {count > 0 && (
              <div className="text-[11px] text-[#6366F1] font-medium mb-2 flex-shrink-0">
                Based on your selections
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto">
              {(staffPicksLoading && !isPreview) || importingSpotify ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-[#6366F1]" />
                </div>
              ) : visiblePicks.length > 0 ? (
                <div className="flex flex-col gap-[1px]" data-testid="staff-picks-list">
                  {visiblePicks.map((pick) => (
                    <PodcastRow
                      key={pick.slug}
                      name={pick.name}
                      artworkUrl={pick.artworkUrl}
                      meta={pick.category || ""}
                      isSelected={false}
                      onToggle={() => toggleSelected(pick.slug, pick.name, pick.artworkUrl)}
                      testId={`onboarding-staff-pick-${pick.slug}`}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-[14px] text-[#A1A1AA]">Search above or import from Spotify to get started</div>
              )}
            </div>
          </div>

          <div className="hidden md:flex flex-col px-5 pt-7 pb-5 bg-[#F7F7FC] dark:bg-[#0C0C12] overflow-hidden rounded-r-xl">
            {rightPanel}
          </div>
        </div>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
        {mobileDrawerOpen && (
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setMobileDrawerOpen(false)} />
        )}

        <AnimatePresence>
          {mobileDrawerOpen && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-[#F7F7FC] dark:bg-[#0C0C12] rounded-t-2xl border-t border-[#E4E4E7] dark:border-[#27272A] shadow-[0_-8px_32px_rgba(0,0,0,0.12)] max-h-[70vh] flex flex-col"
            >
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-[#E4E4E7] dark:bg-[#3F3F46]" />
              </div>
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
                {rightPanel}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!mobileDrawerOpen && (
          <div className="bg-white/95 dark:bg-[#09090B]/95 backdrop-blur-md border-t border-[#F0F0F2] dark:border-[#1C1C22] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <div className="mb-2.5">
              <ProgressBar percent={progressPercent} />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileDrawerOpen(true)}
                className="flex-1 flex items-center gap-2 min-w-0"
                data-testid="mobile-feed-toggle"
              >
                <div className="flex -space-x-2 flex-shrink-0">
                  {Array.from(selectedPodcasts.values()).slice(0, 3).map((info, i) => (
                    <div key={i} className="w-7 h-7 rounded-md overflow-hidden border-2 border-white dark:border-[#09090B] bg-[#EEF2FF] flex items-center justify-center">
                      {info.artworkUrl ? (
                        <img src={hiResArtwork(info.artworkUrl)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Podcast className="w-3 h-3 text-[#6366F1]" />
                      )}
                    </div>
                  ))}
                  {count === 0 && (
                    <div className="w-7 h-7 rounded-md border-2 border-dashed border-[#E4E4E7] dark:border-[#3F3F46] bg-[#F7F7FC] dark:bg-[#1C1C22]" />
                  )}
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-[12px] font-semibold text-[#09090B] dark:text-white">{count} added</p>
                  <p className="text-[10px] text-[#A1A1AA] truncate" dangerouslySetInnerHTML={{ __html: mc.text }} />
                </div>
              </button>
              <button
                onClick={() => {
                  if (isReady) completeMutation.mutate();
                  else setMobileDrawerOpen(true);
                }}
                disabled={completeMutation.isPending}
                className={`flex-shrink-0 h-10 px-5 rounded-[10px] font-semibold text-[13px] transition-all ${
                  isReady
                    ? "text-white hover:opacity-90"
                    : "bg-[#E4E4E7] dark:bg-[#27272A] text-[#A1A1AA] dark:text-[#52525B]"
                }`}
                style={isReady ? {
                  background: `linear-gradient(135deg, rgba(99,102,241,${0.45 + Math.min((count - MIN_PICKS) / 5, 1) * 0.55}), rgba(139,92,246,${0.45 + Math.min((count - MIN_PICKS) / 5, 1) * 0.55}))`,
                } : undefined}
                data-testid="mobile-cta"
              >
                {completeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isReady ? "Build my Recap →" : `${MIN_PICKS - count} more`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
