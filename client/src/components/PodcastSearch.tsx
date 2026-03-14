import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, X, Plus, Loader2, Podcast, Crown, Mic, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { RequestPodcastDialog } from "./RequestPodcastDialog";

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
  maxSelection?: number;
}

export function PodcastSearch({ selectedPodcasts, onAdd, maxSelection }: PodcastSearchProps) {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<PodcastResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
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
      artist: podcast.artistName,
    });
    setSearchQuery("");
    setResults([]);
  };

  return (
    <div>
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
                    Free plan limit reached
                  </h3>
                  <p className="text-base text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">
                    You're currently on the <span className="font-semibold text-foreground">free plan</span>, which includes up to 3 podcasts. Upgrade to Pro for unlimited podcast recaps.
                  </p>
                </div>
                <div className="w-full space-y-2.5">
                  <button
                    data-testid="button-upgrade-modal"
                    onClick={() => { setShowUpgradeModal(false); navigate("/dashboard?tab=plan"); }}
                    className="w-full min-h-[52px] flex items-center justify-center gap-2 rounded-xl font-display font-bold text-[17px] bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-[0.98]"
                  >
                    <Crown className="w-5 h-5" />
                    Upgrade to Pro - $9.99/month
                  </button>
                  <button
                    data-testid="button-dismiss-upgrade"
                    onClick={() => setShowUpgradeModal(false)}
                    className="w-full min-h-[44px] flex items-center justify-center rounded-xl text-base font-semibold text-[#52525B] dark:text-[#A1A1AA] hover:text-foreground hover:bg-black/[0.03] transition-colors"
                  >
                    Not now
                  </button>
                </div>
                <p className="text-[16px] text-[#52525B] dark:text-[#A1A1AA]">Cancel anytime. No questions asked.</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

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
                            {podcast.artistName}
                          </p>
                        </div>
                        <Plus className="w-5 h-5 text-[#52525B] dark:text-[#A1A1AA] shrink-0 transition-colors group-hover/row:text-primary" />
                      </div>
                    ))}
                </div>
              ) : (
                <div className="px-6 py-8 text-center">
                  <Mic className="w-8 h-8 text-[#A1A1AA] mx-auto mb-2" />
                  <p className="text-base font-semibold text-foreground mb-1" data-testid="text-no-results-dashboard">We don't track this podcast yet</p>
                  <p className="text-[14px] text-[#52525B] dark:text-[#A1A1AA] mb-4">But we could! Let us know why it's worth adding.</p>
                  <button
                    onClick={() => setShowRequestDialog(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[14px] font-semibold bg-[#6366F1] text-white hover:bg-[#6366F1]/90 transition-all active:scale-[0.98]"
                    data-testid="button-request-podcast"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Request this podcast
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <RequestPodcastDialog
        open={showRequestDialog}
        onClose={() => setShowRequestDialog(false)}
        searchQuery={searchQuery}
      />
    </div>
  );
}
