import { useId, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { activeChip, rangeChips, rangeTitle } from "@/lib/shopping-view";

type Props = {
  open: boolean;
  onClose: () => void;
  today: string;
  from: string;
  to: string;
  onChange: (to: string) => void;
};

/** Change the end date of the list: quick chips or any date. */
export function RangeSheet({ open, onClose, today, from, to, onChange }: Props) {
  const inputId = useId();
  const [custom, setCustom] = useState("");
  const active = activeChip(today, to);
  const choose = (value: string): void => {
    onChange(value);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Hvor langt skal du handle til?" subtitle={rangeTitle(from, to, today)}>
      <div className="flex flex-col gap-4 px-3 pb-3">
        <div className="flex flex-wrap gap-2">
          {rangeChips(today).map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={active === chip.id}
              onClick={() => choose(chip.to)}
              className={`h-12 rounded-full px-5 text-[15px] font-semibold ${
                active === chip.id ? "bg-accent text-on-accent" : "bg-raised text-ink"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-sm text-muted">
            Eller vælg en dato
          </label>
          <div className="flex gap-2">
            <input
              id={inputId}
              type="date"
              min={today}
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              className="h-12 min-w-0 flex-1 rounded-2xl border border-line bg-raised px-4 text-base text-ink [color-scheme:dark]"
            />
            <button
              type="button"
              disabled={!custom || custom < today}
              onClick={() => choose(custom)}
              className="h-12 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent disabled:opacity-40"
            >
              Brug dato
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
