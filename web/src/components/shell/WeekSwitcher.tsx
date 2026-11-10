import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysToKey, formatDateRange, isoWeekNumber, parseDateKey } from "@madplan/domain";

type Props = {
  weekStart: string;
  /** Called with the Monday of the requested week. */
  onChange: (weekStart: string) => void;
  /** Compact single-line variant for the phone header. */
  compact?: boolean;
};

const arrow =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-ink hover:bg-raised";

export function weekTitle(weekStart: string): { title: string; range: string } {
  const end = addDaysToKey(weekStart, 6);
  return {
    title: `Uge ${isoWeekNumber(parseDateKey(weekStart))}`,
    range: formatDateRange(weekStart, end),
  };
}

export function WeekSwitcher({ weekStart, onChange, compact }: Props) {
  const { title, range } = weekTitle(weekStart);
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Forrige uge"
        onClick={() => onChange(addDaysToKey(weekStart, -7))}
        className={arrow}
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      {compact ? null : (
        <div className="min-w-[116px] px-2.5 text-center leading-tight" aria-live="polite">
          <div className="text-[15px] font-semibold">{title}</div>
          <div className="text-[13px] text-muted">{range}</div>
        </div>
      )}
      <button
        type="button"
        aria-label="Næste uge"
        onClick={() => onChange(addDaysToKey(weekStart, 7))}
        className={arrow}
      >
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
