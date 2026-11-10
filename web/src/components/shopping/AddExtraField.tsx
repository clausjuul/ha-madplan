import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

/** "Tilføj fx 2 liter mælk" – adds a free-text extra item. */
export function AddExtraField({ onAdd }: { onAdd: (label: string) => void }) {
  const [value, setValue] = useState("");
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const label = value.trim();
    if (!label) return;
    onAdd(label);
    setValue("");
  };
  return (
    <form onSubmit={submit} className="flex h-12 items-center gap-2.5 rounded-[14px] bg-surface pl-3.5 pr-1.5">
      <Plus size={18} className="shrink-0 text-muted" aria-hidden="true" />
      <label className="flex-1">
        <span className="sr-only">Tilføj vare</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Tilføj fx 2 liter mælk"
          enterKeyHint="done"
          autoComplete="off"
          maxLength={100}
          className="h-12 w-full border-0 bg-transparent text-base text-ink outline-none placeholder:text-muted"
        />
      </label>
      {value.trim() ? (
        <button
          type="submit"
          className="h-10 shrink-0 rounded-full bg-accent px-4 text-[15px] font-semibold text-on-accent"
        >
          Tilføj
        </button>
      ) : null}
    </form>
  );
}
