import { useId, type ReactElement, type ReactNode } from "react";
import { cloneElement } from "react";

export const inputClass =
  "h-12 w-full rounded-2xl border border-line bg-ground px-4 text-[15px] text-ink outline-none placeholder:text-muted focus:border-accent aria-[invalid=true]:border-danger";

type Props = {
  label: string;
  error?: string;
  hint?: string;
  /** A single input / textarea; it receives the id and aria wiring. */
  children: ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>;
  className?: string;
};

/** Label + control + hint/error with correct aria wiring. */
export function Field({ label, error, hint, children, className = "" }: Props): ReactNode {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-semibold text-ink-2">
        {label}
      </label>
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": note ? noteId : undefined,
      })}
      {note ? (
        <p id={noteId} className={`m-0 text-[13px] ${error ? "text-danger" : "text-muted"}`}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
