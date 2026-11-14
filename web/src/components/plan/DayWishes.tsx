import { useState } from "react";
import { ChevronDown, Clock } from "lucide-react";
import { parseDateKey, weekdayName } from "@madplan/domain";

type Props = {
  dates: readonly string[];
  wishes: Readonly<Record<string, string>>;
  /** Days marked "god tid". */
  relaxed: readonly string[];
  onChange: (date: string, wish: string) => void;
  onToggleRelaxed: (date: string) => void;
};

const label = (date: string): string => `${weekdayName(date, "long")} ${parseDateKey(date).getDate()}.`;

/** Optional wish per day, one expandable row per planned date, and a "God tid" toggle per day. */
export function DayWishes({ dates, wishes, relaxed, onChange, onToggleRelaxed }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {dates.map((date) => {
        const wish = wishes[date] ?? "";
        const expanded = open === date;
        const isRelaxed = relaxed.includes(date);
        return (
          <li key={date} className="rounded-2xl bg-raised">
            <div className="flex items-center pr-2">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : date)}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 pl-4 pr-2 text-left text-[15px]"
              >
                <span className="w-28 shrink-0 font-semibold capitalize">{label(date)}</span>
                <span className={`min-w-0 flex-1 truncate ${wish ? "text-ink-2" : "text-muted"}`}>{wish || "Intet særligt"}</span>
                <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
              <button
                type="button"
                aria-pressed={isRelaxed}
                aria-label={`God tid ${label(date)}`}
                title="Retten må tage længere tid og koste lidt mere"
                onClick={() => onToggleRelaxed(date)}
                className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ${
                  isRelaxed ? "bg-accent text-on-accent" : "border border-line text-muted hover:text-ink"
                }`}
              >
                <Clock size={14} aria-hidden="true" />
                God tid
              </button>
            </div>
            {expanded ? (
              <div className="px-4 pb-3">
                <input
                  type="text"
                  autoFocus
                  aria-label={`Ønske til ${label(date)}`}
                  value={wish}
                  maxLength={300}
                  placeholder="Fx noget hurtigt, fordi der er fodbold"
                  onChange={(event) => onChange(date, event.target.value)}
                  className="h-12 w-full rounded-2xl border border-line bg-ground px-4 text-[15px] text-ink outline-none placeholder:text-muted focus:border-accent"
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
