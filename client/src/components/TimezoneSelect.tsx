import { useState, useRef, useEffect } from "react";
import { Search, Globe, ChevronDown, Check, Clock } from "lucide-react";

const POPULAR_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Zurich",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Helsinki",
  "Europe/Bucharest",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Brisbane",
  "Pacific/Auckland",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Phoenix",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "America/Buenos_Aires",
  "America/Bogota",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Africa/Casablanca",
];

function getAllTimezones(): string[] {
  try {
    return (Intl as any).supportedValuesOf("timeZone");
  } catch {
    return POPULAR_TIMEZONES;
  }
}

function formatTzLabel(tz: string): string {
  const parts = tz.split("/");
  const city = (parts[parts.length - 1] || "").replace(/_/g, " ");
  const region = parts[0] || "";
  return `${city} (${region})`;
}

function getCurrentOffset(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((p) => p.type === "timeZoneName");
    return offsetPart?.value || "";
  } catch {
    return "";
  }
}

function getCurrentTime(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());
  } catch {
    return "";
  }
}

function getDetectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/New_York";
  }
}

interface TimezoneSelectProps {
  value: string;
  onChange: (tz: string) => void;
}

export function TimezoneSelect({ value, onChange }: TimezoneSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allTimezones = getAllTimezones();
  const detectedTz = getDetectedTimezone();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (open && listRef.current) {
      const selected = listRef.current.querySelector('[data-selected="true"]');
      if (selected) {
        selected.scrollIntoView({ block: "nearest" });
      }
    }
  }, [open]);

  const searchLower = search.toLowerCase().replace(/\s+/g, "");
  const filtered = search
    ? allTimezones.filter((tz) => {
        const label = formatTzLabel(tz).toLowerCase().replace(/\s+/g, "");
        const raw = tz.toLowerCase().replace(/[/_]/g, "");
        return label.includes(searchLower) || raw.includes(searchLower);
      })
    : [];

  const popularFiltered = search
    ? POPULAR_TIMEZONES.filter((tz) => filtered.includes(tz))
    : POPULAR_TIMEZONES;
  const otherFiltered = search
    ? filtered.filter((tz) => !POPULAR_TIMEZONES.includes(tz))
    : allTimezones.filter((tz) => !POPULAR_TIMEZONES.includes(tz));

  const showDetected = !search && detectedTz && detectedTz !== value;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-testid="select-delivery-timezone"
        onClick={() => setOpen(!open)}
        className="w-full h-12 px-4 bg-black/[0.03] border border-black/[0.06] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium cursor-pointer flex items-center justify-between gap-2 text-left"
      >
        <span className="truncate text-sm">
          {formatTzLabel(value)}{" "}
          <span className="text-muted-foreground">{getCurrentOffset(value)}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-2 left-0 w-full sm:w-96 bg-white border border-black/[0.08] rounded-2xl shadow-xl shadow-black/10 overflow-hidden">
          <div className="p-3 border-b border-black/[0.06]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              <input
                ref={searchRef}
                data-testid="input-timezone-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search timezones..."
                className="w-full h-10 pl-9 pr-4 bg-black/[0.03] border border-black/[0.06] rounded-xl text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-medium placeholder:text-muted-foreground/40"
              />
            </div>
          </div>

          <div ref={listRef} className="max-h-72 overflow-y-auto overscroll-contain">
            {showDetected && (
              <div className="px-3 pt-3 pb-1">
                <p className="text-[15px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1.5">Detected</p>
                <button
                  type="button"
                  onClick={() => { onChange(detectedTz); setOpen(false); setSearch(""); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-primary/5 transition-colors"
                  data-testid="button-detected-timezone"
                >
                  <Globe className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{formatTzLabel(detectedTz)}</p>
                    <p className="text-[15px] text-muted-foreground">{getCurrentOffset(detectedTz)} · {getCurrentTime(detectedTz)}</p>
                  </div>
                </button>
              </div>
            )}

            {popularFiltered.length > 0 && (
              <div className="px-3 pt-3 pb-1">
                {!search && <p className="text-[15px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1.5">Popular</p>}
                {popularFiltered.map((tz) => (
                  <button
                    key={tz}
                    type="button"
                    data-selected={tz === value ? "true" : "false"}
                    onClick={() => { onChange(tz); setOpen(false); setSearch(""); }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                      tz === value ? "bg-primary/8" : "hover:bg-black/[0.03]"
                    }`}
                    data-testid={`tz-option-${tz.replace(/\//g, "-")}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${tz === value ? "font-semibold text-primary" : "font-medium text-foreground"}`}>
                        {formatTzLabel(tz)}
                      </p>
                    </div>
                    <span className="text-[15px] text-muted-foreground shrink-0 tabular-nums">{getCurrentOffset(tz)}</span>
                    {tz === value && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {otherFiltered.length > 0 && (
              <div className="px-3 pt-2 pb-2">
                {!search && <p className="text-[15px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1.5 mt-1">All Timezones</p>}
                {search && popularFiltered.length > 0 && (
                  <div className="border-t border-black/[0.06] my-2" />
                )}
                {otherFiltered.map((tz) => (
                  <button
                    key={tz}
                    type="button"
                    data-selected={tz === value ? "true" : "false"}
                    onClick={() => { onChange(tz); setOpen(false); setSearch(""); }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                      tz === value ? "bg-primary/8" : "hover:bg-black/[0.03]"
                    }`}
                    data-testid={`tz-option-${tz.replace(/\//g, "-")}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${tz === value ? "font-semibold text-primary" : "font-medium text-foreground"}`}>
                        {formatTzLabel(tz)}
                      </p>
                    </div>
                    <span className="text-[15px] text-muted-foreground shrink-0 tabular-nums">{getCurrentOffset(tz)}</span>
                    {tz === value && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {search && popularFiltered.length === 0 && otherFiltered.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-base text-[#3F3F46] dark:text-[#A1A1AA] dark:text-muted-foreground">No timezones match "{search}"</p>
              </div>
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-black/[0.06] bg-black/[0.01]">
            <p className="text-[15px] text-muted-foreground/60 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Current time in {formatTzLabel(value)}: {getCurrentTime(value)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export { getDetectedTimezone };
