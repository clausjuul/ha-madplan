import { useId, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { addChips, removeChip } from "@/lib/chips";

type Props = {
  label: string;
  values: readonly string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  /** Hide the visible label (the input still gets it for assistive tech). */
  hideLabel?: boolean;
};

/** One value per chip. Enter or comma commits what is typed; pasted lists are split. */
export function ChipInput({ label, values, onChange, placeholder, hideLabel }: Props) {
  const [text, setText] = useState("");
  const id = useId();

  const commit = (value: string): void => {
    if (!value.trim()) return;
    onChange(addChips(values, value));
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit(text);
    } else if (event.key === "Backspace" && !text && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-sm font-semibold text-ink-2"}>
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-ground px-2.5 py-2 focus-within:border-accent">
        {values.map((value) => (
          <span
            key={value}
            className="flex h-9 items-center gap-0.5 rounded-full bg-raised pl-3.5 pr-1 text-[15px] text-ink"
          >
            {value}
            <button
              type="button"
              aria-label={`Fjern ${value}`}
              onClick={() => onChange(removeChip(values, value))}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-ink"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          onChange={(event) => {
            const next = event.target.value;
            if (next.includes(",") || next.includes("\n")) commit(next);
            else setText(next);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => commit(text)}
          placeholder={values.length === 0 ? placeholder : "Tilføj…"}
          enterKeyHint="done"
          className="h-10 min-w-[120px] flex-1 bg-transparent px-1.5 text-[15px] text-ink outline-none placeholder:text-muted"
        />
      </div>
    </div>
  );
}
