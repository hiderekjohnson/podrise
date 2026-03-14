// See BRAND.md for all typography, color, spacing, and accessibility rules.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, ArrowUp, ArrowDown, Search } from "lucide-react";

interface BackfillPodcast {
  name: string;
  itunesId: string;
  transcriptCount: number;
  totalEpisodes: number;
}

interface BackfillData {
  podcasts: BackfillPodcast[];
  totalTranscripts: number;
  totalPodcasts: number;
}

export default function BackfillTracker() {
  const [sortCol, setSortCol] = useState<"name" | "totalEpisodes" | "transcriptCount">("transcriptCount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery<BackfillData>({
    queryKey: ["/api/admin/backfill-status"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="backfill-loading">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return null;

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir(col === "name" ? "asc" : "desc");
    }
  };

  const podcastsWithTranscripts = data.podcasts.filter(p => p.transcriptCount > 0).length;
  const podcastsAt100 = data.podcasts.filter(p => p.transcriptCount >= 100).length;
  const podcastsZero = data.podcasts.filter(p => p.transcriptCount === 0).length;

  const filtered = data.podcasts
    .filter(p => {
      if (!search) return true;
      return p.name.toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortCol === "name") return dir * a.name.localeCompare(b.name);
      return dir * ((a[sortCol] || 0) - (b[sortCol] || 0));
    });

  return (
    <div data-testid="backfill-tracker">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-[#E4E4E7] rounded-xl p-4" data-testid="stat-total-transcripts">
          <div className="text-xs font-semibold text-[#A1A1AA] mb-1">Total Transcripts</div>
          <div className="text-2xl font-bold text-[#09090B]">{data.totalTranscripts.toLocaleString()}</div>
        </div>
        <div className="bg-white border border-[#E4E4E7] rounded-xl p-4" data-testid="stat-total-podcasts">
          <div className="text-xs font-semibold text-[#A1A1AA] mb-1">Total Podcasts</div>
          <div className="text-2xl font-bold text-[#09090B]">{data.totalPodcasts}</div>
          <div className="text-xs text-[#A1A1AA]">{podcastsWithTranscripts} with transcripts</div>
        </div>
        <div className="bg-white border border-[#E4E4E7] rounded-xl p-4" data-testid="stat-at-100">
          <div className="text-xs font-semibold text-[#A1A1AA] mb-1">At 100+ Transcripts</div>
          <div className="text-2xl font-bold text-[#6366F1]">{podcastsAt100}</div>
          <div className="text-xs text-[#A1A1AA]">{Math.round(podcastsAt100 / data.totalPodcasts * 100)}% of podcasts</div>
        </div>
        <div className="bg-white border border-[#E4E4E7] rounded-xl p-4" data-testid="stat-zero">
          <div className="text-xs font-semibold text-[#A1A1AA] mb-1">Zero Transcripts</div>
          <div className="text-2xl font-bold text-[#09090B]">{podcastsZero}</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA]" />
          <input
            type="text"
            placeholder="Search podcasts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#E4E4E7] text-sm text-[#09090B] placeholder:text-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1]"
            data-testid="input-search-podcasts"
          />
        </div>
        <button
          data-testid="button-refresh-backfill"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[#52525B] hover:text-[#09090B] hover:bg-[#F0F0F2] transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="border border-[#E4E4E7] rounded-xl overflow-hidden">
        <table className="w-full" data-testid="table-backfill">
          <thead>
            <tr className="bg-[#F7F7FC]">
              {([
                { col: "name" as const, label: "Podcast", align: "text-left" },
                { col: "totalEpisodes" as const, label: "Total Episodes", align: "text-center" },
                { col: "transcriptCount" as const, label: "Transcripts", align: "text-center" },
              ]).map(h => (
                <th
                  key={h.col}
                  className={`${h.align} px-4 py-3 text-xs font-semibold text-[#52525B] cursor-pointer select-none hover:text-[#09090B] transition-colors`}
                  onClick={() => toggleSort(h.col)}
                  data-testid={`sort-${h.col}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {h.label}
                    {sortCol === h.col ? (
                      sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.itunesId}
                data-testid={`row-podcast-${p.itunesId}`}
                className="border-t border-[#F0F0F2] hover:bg-[#F7F7FC]/50 transition-colors"
              >
                <td className="px-4 py-2.5 text-sm font-medium text-[#09090B]" data-testid={`name-${p.itunesId}`}>
                  {p.name}
                </td>
                <td className="px-4 py-2.5 text-center text-sm text-[#52525B]" data-testid={`episodes-${p.itunesId}`}>
                  {p.totalEpisodes > 0 ? p.totalEpisodes.toLocaleString() : "—"}
                </td>
                <td className="px-4 py-2.5 text-center text-sm font-semibold text-[#09090B]" data-testid={`count-${p.itunesId}`}>
                  {p.transcriptCount}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#E4E4E7] bg-[#F7F7FC]">
              <td className="px-4 py-3 text-sm font-bold text-[#09090B]" data-testid="total-podcasts">
                {filtered.length} Podcasts
              </td>
              <td className="px-4 py-3 text-center text-sm font-bold text-[#52525B]" data-testid="total-episodes">
                {filtered.reduce((sum, p) => sum + p.totalEpisodes, 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-center text-sm font-bold text-[#09090B]" data-testid="total-transcripts">
                {filtered.reduce((sum, p) => sum + p.transcriptCount, 0).toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-[#A1A1AA] mt-3 text-center">
        Showing {filtered.length} of {data.totalPodcasts} podcasts
      </p>
    </div>
  );
}
