import { Lock } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import type { DayModel } from "@/lib/week-model";

type Props = {
  from: DayModel | null;
  /** The days of the shown week. */
  days: DayModel[];
  onPick: (date: string) => void;
  onClose: () => void;
};

export function SwapDaySheet({ from, days, onPick, onClose }: Props) {
  return (
    <Sheet
      open={from !== null}
      onClose={onClose}
      title="Byt med anden dag"
      subtitle={from ? `${from.dish?.name ?? ""} · ${from.longLabel}` : undefined}
    >
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {days
          .filter((day) => day.date !== from?.date)
          .map((day) => (
            <li key={day.date}>
              <button
                type="button"
                disabled={day.locked}
                onClick={() => onPick(day.date)}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-ink hover:bg-raised disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span className="w-24 shrink-0 text-sm text-muted">{day.longLabel}</span>
                <span className="min-w-0 flex-1 truncate text-base font-medium">
                  {day.dish?.name ?? "Ingen ret"}
                </span>
                {day.locked ? <Lock size={16} aria-label="Låst" className="text-muted" /> : null}
              </button>
            </li>
          ))}
      </ul>
    </Sheet>
  );
}
