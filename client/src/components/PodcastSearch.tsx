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
                    onClick={() => { setShowUpgradeModal(false); navigate("/dashboard?tab=plan"); }}
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

      <div className="relative">
        <div className="relative group flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 transition-colors group-focus-within:text-primary" />
            <input
              data-testid="input-search-podcasts"
              type="search"
              placeholder="Search podcasts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-14 pl-12 pr-10 bg-white border border-black/[0.08] rounded-2xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/25 transition-all font-medium shadow-sm shadow-black/[0.03]"
            />
            {searchQuery && (
              <button
                data-testid="button-clear-search"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/[0.06] text-muted-foreground hover:bg-black/[0.1] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
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
              className="absolute left-0 right-0 z-50 bg-white rounded-3xl shadow-2xl shadow-black/[0.12] border border-black/[0.06] overflow-hidden max-h-[360px] overflow-y-auto"
            >
              {isSearching ? (
                <div className="flex items-center justify-center gap-2.5 px-6 py-10 text-sm text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span>Searching podcasts...</span>
                </div>
              ) : filteredResults.length > 0 ? (
                <div className="py-2">
                  <p className="px-6 pt-3 pb-2 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                    Results
                  </p>
                  {filteredResults.map((podcast) => (
                      <div
                        key={podcast.id}
                        data-testid={`button-add-podcast-${podcast.id}`}
                        onClick={() => handleAddClick(podcast)}
                        className="flex items-center gap-4 px-6 py-3.5 w-full text-left transition-colors group/row hover:bg-black/[0.03] cursor-pointer"
                      >
                        {podcast.artworkUrl ? (
                          <img
                            src={podcast.artworkUrl}
                            alt={podcast.name}
                            className="w-12 h-12 rounded-xl object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-primary/[0.08] flex items-center justify-center shrink-0">
                            <Podcast className="w-5 h-5 text-primary" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground text-[15px] truncate">
                            {podcast.name}
                          </p>
                          <p className="text-[13px] text-muted-foreground/60 truncate mt-0.5">
                            {podcast.artistName}
                          </p>
                        </div>
                        <Plus className="w-5 h-5 text-muted-foreground/30 shrink-0 transition-colors group-hover/row:text-primary" />
                      </div>
                    ))}
                </div>
              ) : (
                <div className="px-6 py-10 text-center">
                  <p className="text-sm text-muted-foreground">No podcasts found</p>
                  <p className="text-xs text-muted-foreground/50 mt-1">Try a different search term</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {selectedPodcasts.length > 0 && (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {selectedPodcasts.map((podcast) => (
              <motion.div
                key={podcast.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                data-testid={`card-podcast-${podcast.id}`}
                className="flex items-center gap-4 p-3 bg-white border border-black/[0.06] rounded-2xl shadow-sm shadow-black/[0.02] group"
              >
                {podcast.artworkUrl ? (
                  <img
                    src={hiResArtwork(podcast.artworkUrl)}
                    alt={podcast.name}
                    className="w-12 h-12 rounded-xl object-cover shrink-0"
                    data-testid={`img-podcast-${podcast.id}`}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-primary/[0.08] flex items-center justify-center shrink-0">
                    <Podcast className="w-5 h-5 text-primary" />
                  </div>
                )}
                <p className="flex-1 min-w-0 font-semibold text-[15px] text-foreground truncate" data-testid={`text-podcast-name-${podcast.id}`}>
                  {podcast.name}
                </p>
                <button
                  data-testid={`button-remove-podcast-${podcast.id}`}
                  onClick={() => onRemove(podcast.id)}
                  className="p-2 rounded-xl text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                  aria-label={`Remove ${podcast.name}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

    </div>
  );
}
