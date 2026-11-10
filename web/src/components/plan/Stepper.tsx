import { Minus, Plus } from "lucide-react";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Spoken/shown noun after the number, e.g. "dage". */
  unit: string;
  /** Overrides the shown text when 0 is not best written as "0 nye retter". */
  describe?: (value: number) => string;
};

/** − / + counter with 44px+ targets. */
export function Stepper({ label, value, min, max, onChange, unit, describe }: Props) {
  const button = "flex h-12 w-12 items-center justify-center rounded-full bg-raised text-ink disabled:opacity-35";
  return (
    <div role="group" aria-label={label} className="flex items-center gap-3">
      <button type="button" aria-label={`Færre ${unit}`} disabled={value <= min} onClick={() => onChange(value - 1)} className={button}>
        <Minus size={20} aria-hidden="true" />
      </button>
      <output aria-live="polite" className="min-w-[88px] text-center font-display text-2xl font-bold">
        {describe ? describe(value) : `${value} ${unit}`}
      </output>
      <button type="button" aria-label={`Flere ${unit}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={button}>
        <Plus size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

export const chipClass = (active: boolean): string =>
  `flex min-h-11 items-center rounded-full px-4 text-[15px] font-medium ${
    active ? "bg-accent text-on-accent" : "border border-line bg-surface text-ink-2 hover:text-ink"
  }`;
