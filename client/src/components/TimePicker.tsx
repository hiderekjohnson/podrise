import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

function to24(hour: number, period: "AM" | "PM"): number {
  if (period === "AM") return hour === 12 ? 0 : hour;
  return hour === 12 ? 12 : hour + 12;
}

function from24(h24: number): { hour: number; period: "AM" | "PM" } {
  const period: "AM" | "PM" = h24 < 12 ? "AM" : "PM";
  const hour = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return { hour, period };
}

function parseValue(value: string): { hour: number; minute: number; period: "AM" | "PM" } {
  const [hStr, mStr] = value.split(":");
  const h24 = parseInt(hStr, 10) || 0;
  const minute = parseInt(mStr, 10) || 0;
  const { hour, period } = from24(h24);
  return { hour, minute, period };
}

function formatValue(hour: number, minute: number, period: "AM" | "PM"): string {
  const h24 = to24(hour, period);
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const PERIODS: ("AM" | "PM")[] = ["AM", "PM"];

interface ColumnDropdownProps {
  options: { value: number | string; label: string }[];
  selected: number | string;
  onSelect: (val: number | string) => void;
  testIdPrefix: string;
  label: string;
}

function ColumnDropdown({ options, selected, onSelect, testIdPrefix, label }: ColumnDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open && listRef.current) {
      const active = listRef.current.querySelector('[data-active="true"]');
      if (active) active.scrollIntoView({ block: "nearest" });
    }
  }, [open]);

  const selectedLabel = options.find((o) => o.value === selected)?.label ?? String(selected);

  return (
    <div ref={ref} className="relative flex flex-col items-center gap-1.5">
      <button
        type="button"
        data-testid={`${testIdPrefix}-trigger`}
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between gap-1 min-h-[52px] px-4 min-w-[72px] bg-black/[0.03] border border-black/[0.06] rounded-xl text-foreground font-semibold text-[17px] hover:bg-black/[0.05] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all cursor-pointer"
      >
        <span>{selectedLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <span className="text-[15px] font-medium text-[#3F3F46] dark:text-[#A1A1AA]">{label}</span>

      {open && (
        <div
          ref={listRef}
          className="absolute z-50 top-full mt-1 left-1/2 -translate-x-1/2 min-w-[80px] bg-white border border-black/[0.08] rounded-xl shadow-xl shadow-black/10 overflow-hidden"
        >
          <div className="max-h-48 overflow-y-auto overscroll-contain py-1">
            {options.map((opt) => {
              const isActive = opt.value === selected;
              return (
                <button
                  key={opt.value}
                  type="button"
                  data-active={isActive ? "true" : "false"}
                  data-testid={`${testIdPrefix}-${opt.value}`}
                  onClick={() => { onSelect(opt.value); setOpen(false); }}
                  className={`w-full px-4 py-3 text-center text-base min-h-[48px] transition-colors ${
                    isActive
                      ? "bg-primary/8 text-primary font-semibold"
                      : "text-foreground hover:bg-black/[0.03] font-medium"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function TimePicker({ value, onChange }: TimePickerProps) {
  const committed = parseValue(value);
  const [draft, setDraft] = useState(committed);

  useEffect(() => {
    const parsed = parseValue(value);
    setDraft(parsed);
  }, [value]);

  const isDirty =
    draft.hour !== committed.hour ||
    draft.minute !== committed.minute ||
    draft.period !== committed.period;

  const handleConfirm = () => {
    onChange(formatValue(draft.hour, draft.minute, draft.period));
  };

  return (
    <div className="flex items-start gap-2" data-testid="time-picker">
      <ColumnDropdown
        options={HOURS.map((h) => ({ value: h, label: String(h) }))}
        selected={draft.hour}
        onSelect={(val) => setDraft((d) => ({ ...d, hour: typeof val === "number" ? val : parseInt(val as string, 10) }))}
        testIdPrefix="time-hour"
        label="Hour"
      />
      <ColumnDropdown
        options={MINUTES.map((m) => ({ value: m, label: String(m).padStart(2, "0") }))}
        selected={draft.minute}
        onSelect={(val) => setDraft((d) => ({ ...d, minute: typeof val === "number" ? val : parseInt(val as string, 10) }))}
        testIdPrefix="time-minute"
        label="Minute"
      />
      <ColumnDropdown
        options={PERIODS.map((p) => ({ value: p, label: p }))}
        selected={draft.period}
        onSelect={(val) => setDraft((d) => ({ ...d, period: val as "AM" | "PM" }))}
        testIdPrefix="time-period"
        label="AM/PM"
      />
      <div className="flex flex-col items-center gap-1.5">
        <button
          type="button"
          data-testid="button-confirm-time"
          onClick={handleConfirm}
          disabled={!isDirty}
          className={`min-h-[52px] px-5 rounded-xl font-semibold text-[17px] transition-all flex items-center gap-1.5 ${
            isDirty
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.97]"
              : "bg-black/[0.03] text-muted-foreground/40 cursor-default"
          }`}
        >
          <Check className="w-4 h-4" />
          Set
        </button>
        <span className="text-[15px] font-medium text-transparent select-none">.</span>
      </div>
    </div>
  );
}
