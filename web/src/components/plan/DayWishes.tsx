import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { parseDateKey, weekdayName } from "@madplan/domain";

type Props = {
  dates: readonly string[];
  wishes: Readonly<Record<string, string>>;
  onChange: (date: string, wish: string) => void;
};

const label = (date: string): string => `${weekdayName(date, "long")} ${parseDateKey(date).getDate()}.`;

/** Optional wish per day, one expandable row per planned date. */
export function DayWishes({ dates, wishes, onChange }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {dates.map((date) => {
        const wish = wishes[date] ?? "";
        const expanded = open === date;
        return (
          <li key={date} className="rounded-2xl bg-raised">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : date)}
              className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px]"
            >
              <span className="w-28 shrink-0 font-semibold capitalize">{label(date)}</span>
              <span className={`min-w-0 flex-1 truncate ${wish ? "text-ink-2" : "text-muted"}`}>{wish || "Intet særligt"}</span>
              <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
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
