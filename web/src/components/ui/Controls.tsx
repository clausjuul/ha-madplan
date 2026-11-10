import { useEffect, useId, useState, type ReactNode } from "react";
import { inputClass } from "./Field";

/** Switch with a visible label. */
export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 items-center gap-3 text-[15px] text-ink"
    >
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-line"}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-ground transition-all ${checked ? "left-6" : "left-1"}`} />
      </span>
      {label}
    </button>
  );
}

type CommitProps = {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  inputMode?: "text" | "numeric";
  hideLabel?: boolean;
};

/** Text input that saves on blur / Enter instead of on every keystroke. */
export function CommitInput({ label, value, onCommit, placeholder, inputMode, hideLabel }: CommitProps) {
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = (): void => {
    if (text.trim() !== value) onCommit(text.trim());
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-sm font-semibold text-ink-2"}>
        {label}
      </label>
      <input
        id={id}
        value={text}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className={inputClass}
      />
    </div>
  );
}

/** A titled settings card. */
export function SectionCard({ title, description, children, id }: { title: string; description?: string; children: ReactNode; id?: string }) {
  const headingId = useId();
  return (
    <section id={id} aria-labelledby={headingId} className="flex flex-col gap-4 rounded-[28px] bg-surface p-5 md:p-6">
      <header>
        <h2 id={headingId} className="font-display m-0 text-[22px] font-bold">
          {title}
        </h2>
        {description ? <p className="mb-0 mt-1 text-[15px] leading-relaxed text-ink-2">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}
