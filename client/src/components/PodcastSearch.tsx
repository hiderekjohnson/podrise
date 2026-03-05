import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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

function hiResArtwork(url: string) {
  return url.replace(/\/\d+x\d+bb\./, "/300x300bb.");
}

export function PodcastSearch({ selectedPodcasts, onAdd, onRemove, maxSelection }: PodcastSearchProps) {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<PodcastResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
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
      setShowUpgradeModal(true);
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
      {createPortal(
        <AnimatePresence>
          {showUpgradeModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
              onClick={(e) => { if (e.target === e.currentTarget) setShowUpgradeModal(false); }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-2xl shadow-2xl shadow-black/20 w-full max-w-sm p-8 flex flex-col items-center gap-5 text-center"
                data-testid="modal-upgrade"
              >
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Crown className="w-7 h-7 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-display font-extrabold text-xl text-foreground" data-testid="modal-upgrade-title">
                    You've reached your free plan limit
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    The free plan includes up to 3 podcasts. Upgrade to Pro for unlimited podcasts for $9.99/month.
                  </p>
                </div>
                <div className="w-full space-y-2.5">
                  <button
                    data-testid="button-upgrade-modal"
                    onClick={() => { setShowUpgradeModal(false); navigate("/upgrade"); }}
                    className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-sm bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-[0.98]"
                  >
                    <Crown className="w-4 h-4" />
                    Upgrade to Pro — $9.99/month
                  </button>
                  <button
                    data-testid="button-dismiss-upgrade"
                    onClick={() => setShowUpgradeModal(false)}
                    className="w-full h-10 flex items-center justify-center rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-black/[0.03] transition-colors"
                  >
                    Not now
                  </button>
                </div>
                <p className="text-xs text-muted-foreground/60">You can cancel anytime.</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <div className="relative group flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 transition-colors group-focus-within:text-primary" />
          <input
            data-testid="input-search-podcasts"
            type="search"
            placeholder="Search and add your favorite podcasts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-14 pl-12 pr-4 bg-white border border-black/[0.08] rounded-2xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all font-medium shadow-sm shadow-black/[0.03]"
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
            <div className="border border-black/[0.06] rounded-2xl divide-y divide-black/[0.06] overflow-hidden bg-white shadow-md shadow-black/[0.04]">
              {isSearching ? (
                <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching...
                </div>
              ) : filteredResults.length > 0 ? (
                filteredResults.map((podcast) => (
                  <button
                    key={podcast.id}
                    data-testid={`button-add-podcast-${podcast.id}`}
                    onClick={() => handleAddClick(podcast)}
                    className="flex items-center gap-3.5 px-4 py-3 w-full text-left transition-colors hover:bg-black/[0.02] group/row"
                  >
                    {podcast.artworkUrl ? (
                      <img
                        src={podcast.artworkUrl}
                        alt={podcast.name}
                        className="w-12 h-12 rounded-xl object-cover shrink-0 shadow-sm shadow-black/[0.08]"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center shrink-0">
                        <Podcast className="w-5 h-5 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">
                        {podcast.name}
                      </p>
                      <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                        {podcast.artistName}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-full bg-primary/[0.08] text-primary shrink-0 transition-all group-hover/row:bg-primary group-hover/row:text-white group-hover/row:shadow-md group-hover/row:shadow-primary/20">
                      <Plus className="w-3 h-3" />
                      Add
                    </div>
                  </button>
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
      <div className="space-y-3 pt-2">
        <p className="text-sm font-semibold text-foreground px-1">
          Your podcasts
        </p>
          <div className="grid grid-cols-3 gap-3">
            <AnimatePresence>
              {selectedPodcasts.map((podcast) => (
                <motion.div
                  key={podcast.id}
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="group relative bg-white border border-black/[0.06] rounded-2xl p-3 pb-3.5 transition-all hover:shadow-lg hover:shadow-black/[0.06]"
                >
                  <button
                    data-testid={`button-remove-podcast-${podcast.id}`}
                    onClick={() => onRemove(podcast.id)}
                    className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  {podcast.artworkUrl ? (
                    <img
                      src={hiResArtwork(podcast.artworkUrl)}
                      alt={podcast.name}
                      className="w-full aspect-square rounded-xl object-cover shadow-sm shadow-black/[0.06]"
                    />
                  ) : (
                    <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
                      <Podcast className="w-10 h-10 text-primary" />
                    </div>
                  )}
                  <p className="mt-2.5 text-[13px] font-semibold text-foreground leading-snug line-clamp-1">{podcast.name}</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">Daily recap</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
      </div>
      )}
    </div>
  );
}
