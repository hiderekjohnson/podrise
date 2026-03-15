import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";

interface AnalyticsFiltersProps {
  startDate: string;
  endDate: string;
  granularity: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onGranularityChange: (g: string) => void;
}

const PRESETS = [
  { label: "Today", days: 0 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "All", days: -1 },
];

const GRANULARITIES = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
  { label: "Annual", value: "annual" },
];

function formatDateForInput(d: Date): string {
  return d.toISOString().split("T")[0];
}

export default function AnalyticsFilters({
  startDate, endDate, granularity,
  onStartDateChange, onEndDateChange, onGranularityChange,
}: AnalyticsFiltersProps) {
  const [activePreset, setActivePreset] = useState("All");

  const handlePreset = (preset: typeof PRESETS[number]) => {
    setActivePreset(preset.label);
    if (preset.days === -1) {
      onStartDateChange("");
      onEndDateChange("");
    } else {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - preset.days);
      onStartDateChange(formatDateForInput(start));
      onEndDateChange(formatDateForInput(end));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="analytics-filters">
      <div className="flex items-center gap-1 bg-black/[0.03] dark:bg-white/[0.06] rounded-lg p-0.5">
        {PRESETS.map(p => (
          <button
            key={p.label}
            data-testid={`preset-${p.label.toLowerCase()}`}
            onClick={() => handlePreset(p)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
              activePreset === p.label
                ? "bg-white dark:bg-zinc-800 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="date"
          data-testid="input-start-date"
          value={startDate}
          onChange={e => { onStartDateChange(e.target.value); setActivePreset(""); }}
          className="h-7 px-2 text-xs bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.12] rounded-md text-foreground"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          data-testid="input-end-date"
          value={endDate}
          onChange={e => { onEndDateChange(e.target.value); setActivePreset(""); }}
          className="h-7 px-2 text-xs bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.12] rounded-md text-foreground"
        />
      </div>

      <div className="relative">
        <select
          data-testid="select-granularity"
          value={granularity}
          onChange={e => onGranularityChange(e.target.value)}
          className="h-7 pl-2 pr-6 text-xs font-semibold bg-white dark:bg-zinc-900 border border-black/[0.08] dark:border-white/[0.12] rounded-md text-foreground appearance-none cursor-pointer"
        >
          {GRANULARITIES.map(g => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}
