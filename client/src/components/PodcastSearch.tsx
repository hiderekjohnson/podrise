import { useState } from "react";
import { Search, X, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ALL_PODCASTS = [
  { id: "joe-rogan", name: "The Joe Rogan Experience", initials: "JR", color: "bg-red-100 text-red-700" },
  { id: "all-in", name: "All-In Podcast", initials: "AI", color: "bg-blue-100 text-blue-700" },
  { id: "huberman", name: "Huberman Lab", initials: "HL", color: "bg-emerald-100 text-emerald-700" },
  { id: "acquired", name: "Acquired", initials: "AC", color: "bg-purple-100 text-purple-700" },
  { id: "my-first-million", name: "My First Million", initials: "MM", color: "bg-amber-100 text-amber-700" },
  { id: "lex-fridman", name: "Lex Fridman Podcast", initials: "LF", color: "bg-slate-100 text-slate-700" },
  { id: "hbr-ideacast", name: "HBR IdeaCast", initials: "HB", color: "bg-orange-100 text-orange-700" },
  { id: "tim-ferriss", name: "The Tim Ferriss Show", initials: "TF", color: "bg-teal-100 text-teal-700" },
  { id: "the-daily", name: "The Daily", initials: "TD", color: "bg-rose-100 text-rose-700" },
  { id: "invest-best", name: "Invest Like the Best", initials: "IB", color: "bg-indigo-100 text-indigo-700" },
  { id: "morning-joe", name: "The Morning Joe Show", initials: "MJ", color: "bg-sky-100 text-sky-700" },
  { id: "joe-budden", name: "Joe Budden Podcast", initials: "JB", color: "bg-yellow-100 text-yellow-700" },
];

interface PodcastSearchProps {
  selectedIds: string[];
  onToggle: (id: string) => void;
}

export function PodcastSearch({ selectedIds, onToggle }: PodcastSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPodcasts = searchQuery.trim()
    ? ALL_PODCASTS.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !selectedIds.includes(p.id)
      )
    : [];

  const selectedPodcasts = ALL_PODCASTS.filter((p) =>
    selectedIds.includes(p.id)
  );

  return (
    <div className="space-y-4">
      <div className="relative group flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 transition-colors group-focus-within:text-primary" />
          <input
            data-testid="input-search-podcasts"
            type="search"
            placeholder="Search podcasts..."
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
        {searchQuery.trim() && (
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
              {filteredPodcasts.length > 0 ? (
                filteredPodcasts.map((podcast) => (
                  <div
                    key={podcast.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-display font-bold shrink-0 ${podcast.color}`}
                    >
                      {podcast.initials}
                    </div>
                    <span className="flex-1 font-medium text-foreground text-sm">
                      {podcast.name}
                    </span>
                    <button
                      data-testid={`button-add-podcast-${podcast.id}`}
                      onClick={() => onToggle(podcast.id)}
                      className="flex items-center gap-1 text-sm font-semibold text-primary px-3 py-1.5 rounded-lg border border-primary/20 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
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
            Selected Podcasts:
          </p>
          <div className="flex flex-wrap gap-2">
            <AnimatePresence>
              {selectedPodcasts.map((podcast) => (
                <motion.div
                  key={podcast.id}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.85, opacity: 0 }}
                  className="flex items-center gap-1.5 bg-secondary text-foreground pl-3 pr-2 py-1.5 rounded-full text-sm font-medium"
                >
                  {podcast.name}
                  <button
                    data-testid={`button-remove-podcast-${podcast.id}`}
                    onClick={() => onToggle(podcast.id)}
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

export { ALL_PODCASTS };
