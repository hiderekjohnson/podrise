import { useState, useEffect, useRef } from "react";
import { Search, X, Plus, Loader2, Podcast, Mic } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PodcastResult {
  id: string;
  name: string;
  artistName: string;
  artworkUrl: string;
  onPlatform?: boolean;
  genre?: string;
}

interface SelectedPodcast {
  id: string;
  name: string;
  artworkUrl: string;
  artist?: string;
}

interface PodcastSearchProps {
  selectedPodcasts: SelectedPodcast[];
  onAdd: (podcast: SelectedPodcast) => void;
}

export function PodcastSearch({ selectedPodcasts, onAdd }: PodcastSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<PodcastResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const selectedIdSet = new Set(selectedPodcasts.map((p) => p.id));

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/podcasts/search-itunes?term=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        setResults(data.results || []);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const filteredResults = results.filter((r) => !selectedIdSet.has(r.id));

  const handleAddClick = (podcast: PodcastResult) => {
    onAdd({
      id: podcast.id,
      name: podcast.name,
      artworkUrl: podcast.artworkUrl,
      artist: podcast.artistName,
    });
    setSearchQuery("");
    setResults([]);
  };

  return (
    <div>
      <div className="relative">
        <div className="relative group flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#52525B] dark:text-[#A1A1AA] w-5 h-5 transition-colors group-focus-within:text-primary" />
            <input
              data-testid="input-search-podcasts"
              type="search"
              placeholder="Search for a podcast to add..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-[52px] pl-12 pr-10 bg-white border-[1.5px] border-[#D4D4D8] rounded-xl text-foreground placeholder:text-[#71717A] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all font-medium text-[17px]"
            />
            {searchQuery && (
              <button
                data-testid="button-clear-search"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/[0.06] text-[#52525B] dark:text-[#A1A1AA] hover:bg-black/[0.1] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {searchQuery.trim().length >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.98 }}
              animate={{ opacity: 1, y: 8, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="absolute left-0 right-0 z-50 bg-white rounded-2xl shadow-2xl shadow-black/[0.12] border border-black/[0.06] overflow-hidden max-h-[360px] overflow-y-auto"
            >
              {isSearching ? (
                <div className="flex items-center justify-center gap-2.5 px-6 py-10 text-base text-[#52525B] dark:text-[#A1A1AA]">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span>Searching podcasts...</span>
                </div>
              ) : filteredResults.length > 0 ? (
                <div className="py-2">
                  <p className="px-5 pt-3 pb-2 text-[16px] font-bold text-[#52525B] dark:text-[#A1A1AA] uppercase tracking-wider">
                    Results
                  </p>
                  {filteredResults.map((podcast) => (
                      <div
                        key={podcast.id}
                        data-testid={`button-add-podcast-${podcast.id}`}
                        onClick={() => handleAddClick(podcast)}
                        className="flex items-center gap-3.5 px-5 py-3.5 w-full text-left transition-colors group/row hover:bg-black/[0.03] cursor-pointer min-h-[52px]"
                      >
                        {podcast.artworkUrl ? (
                          <img
                            src={podcast.artworkUrl}
                            alt={podcast.name}
                            className="w-12 h-12 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-primary/[0.08] flex items-center justify-center shrink-0">
                            <Podcast className="w-5 h-5 text-primary" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground text-base truncate">
                            {podcast.name}
                          </p>
                          <p className="text-[16px] text-[#52525B] dark:text-[#A1A1AA] truncate mt-0.5">
                            {podcast.onPlatform ? (podcast.artistName || "On PodRise") : (podcast.artistName || podcast.genre || "")}
                          </p>
                        </div>
                        {podcast.onPlatform && (
                          <span className="text-[10px] font-bold text-[#6366F1] bg-[#EEF2FF] dark:bg-[#1E1B4B] px-2 py-0.5 rounded-full flex-shrink-0 mr-1">
                            On PodRise
                          </span>
                        )}
                        <Plus className="w-5 h-5 text-[#52525B] dark:text-[#A1A1AA] shrink-0 transition-colors group-hover/row:text-primary" />
                      </div>
                    ))}
                </div>
              ) : (
                <div className="px-6 py-8 text-center">
                  <Mic className="w-8 h-8 text-[#A1A1AA] mx-auto mb-2" />
                  <p className="text-base font-semibold text-foreground mb-1" data-testid="text-no-results-dashboard">No podcasts found</p>
                  <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA]">Try a different search term.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
