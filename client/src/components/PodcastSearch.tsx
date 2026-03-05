import { useState, useEffect, useRef } from "react";
import { Search, X, Plus, Loader2, Podcast, Crown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";

interface PodcastResult {
  id: string;
  name: string;
  artistName: string;
  artworkUrl: string;
}

interface SelectedPodcast {
  id: string;
  name: string;
  artworkUrl: string;
}

interface PodcastSearchProps {
  selectedPodcasts: SelectedPodcast[];
  onAdd: (podcast: SelectedPodcast) => void;
  onRemove: (id: string) => void;
  maxSelection?: number;
}

export function PodcastSearch({ selectedPodcasts, onAdd, onRemove, maxSelection }: PodcastSearchProps) {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<PodcastResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const selectedIdSet = new Set(selectedPodcasts.map((p) => p.id));
  const atLimit = maxSelection != null && selectedPodcasts.length >= maxSelection;

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
        const res = await fetch(`/api/podcasts/search?term=${encodeURIComponent(trimmed)}`);
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
    if (atLimit) {
      setShowUpgrade(true);
      return;
    }
    onAdd({
      id: podcast.id,
      name: podcast.name,
      artworkUrl: podcast.artworkUrl,
    });
    setSearchQuery("");
    setResults([]);
  };

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {showUpgrade && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="rounded-xl border border-primary/20 bg-primary/[0.04] p-5 flex flex-col items-center gap-3 text-center"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Crown className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-display font-bold text-foreground text-base">
                Get unlimited podcast summaries
              </p>
              <p className="text-2xl font-display font-extrabold text-foreground mt-1">
                $9.99<span className="text-base font-semibold text-muted-foreground">/month</span>
              </p>
            </div>
            <button
              data-testid="button-upgrade"
              onClick={() => navigate("/upgrade")}
              className="w-full max-w-xs h-11 flex items-center justify-center gap-2 rounded-lg font-display font-bold text-sm bg-primary text-primary-foreground shadow-md shadow-primary/20 transition-all active:scale-[0.98]"
            >
              <Crown className="w-4 h-4" />
              Upgrade
            </button>
            <p className="text-xs text-muted-foreground">Cancel anytime</p>
            <button
              data-testid="button-dismiss-upgrade"
              onClick={() => setShowUpgrade(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative group flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 transition-colors group-focus-within:text-primary" />
          <input
            data-testid="input-search-podcasts"
            type="search"
            placeholder="Search and add your favorite podcasts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-12 pl-12 pr-4 bg-black/[0.03] border border-black/[0.06] rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium"
          />
        </div>
        {searchQuery && (
          <button
            data-testid="button-clear-search"
            onClick={() => setSearchQuery("")}
            className="text-sm font-medium text-primary shrink-0"
          >
            Clear
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {searchQuery.trim().length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="space-y-1"
          >
            <p className="text-sm font-semibold text-foreground px-1">
              Search Results for "{searchQuery}"
            </p>
            <div className="border border-black/[0.06] rounded-xl divide-y divide-black/[0.06] overflow-hidden bg-white/60">
              {isSearching ? (
                <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching...
                </div>
              ) : filteredResults.length > 0 ? (
                filteredResults.map((podcast) => (
                  <div
                    key={podcast.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    {podcast.artworkUrl ? (
                      <img
                        src={podcast.artworkUrl}
                        alt={podcast.name}
                        className="w-10 h-10 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Podcast className="w-5 h-5 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">
                        {podcast.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {podcast.artistName}
                      </p>
                    </div>
                    <button
                      data-testid={`button-add-podcast-${podcast.id}`}
                      onClick={() => handleAddClick(podcast)}
                      className={`flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-lg border transition-colors shrink-0 ${
                        atLimit
                          ? "text-muted-foreground border-black/[0.08]"
                          : "text-primary border-primary/20"
                      }`}
                    >
                      {atLimit ? (
                        <>
                          <Crown className="w-3.5 h-3.5" />
                          Upgrade
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          Add
                        </>
                      )}
                    </button>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No podcasts found matching "{searchQuery}"
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedPodcasts.length > 0 && (
      <div className="space-y-2 pt-2">
        <p className="text-sm font-semibold text-foreground px-1">
          Selected podcasts
        </p>
          <div className="flex flex-wrap gap-2">
            <AnimatePresence>
              {selectedPodcasts.map((podcast) => (
                <motion.div
                  key={podcast.id}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.85, opacity: 0 }}
                  className="flex items-center gap-2 bg-secondary text-foreground pl-1.5 pr-2 py-1 rounded-full text-sm font-medium"
                >
                  {podcast.artworkUrl ? (
                    <img
                      src={podcast.artworkUrl}
                      alt={podcast.name}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <Podcast className="w-3 h-3 text-primary" />
                    </div>
                  )}
                  <span className="truncate max-w-[160px]">{podcast.name}</span>
                  <button
                    data-testid={`button-remove-podcast-${podcast.id}`}
                    onClick={() => onRemove(podcast.id)}
                    className="p-0.5 rounded-full text-muted-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
      </div>
      )}
    </div>
  );
}
