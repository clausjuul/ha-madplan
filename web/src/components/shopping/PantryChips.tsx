import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";

type Props = { pantry: readonly string[]; onChange: (items: string[]) => void };

/** Editable "Basisvarer, der ikke skal på listen" chips. */
export function PantryChips({ pantry, onChange }: Props) {
  const [value, setValue] = useState("");
  const add = (event: FormEvent): void => {
    event.preventDefault();
    const name = value.trim();
    if (!name) return;
    const exists = pantry.some((item) => item.toLocaleLowerCase("da-DK") === name.toLocaleLowerCase("da-DK"));
    if (!exists) onChange([...pantry, name]);
    setValue("");
  };
  return (
    <section aria-labelledby="pantry-title" className="rounded-3xl bg-surface p-5">
      <h2 id="pantry-title" className="text-[15px] font-semibold">
        Basisvarer, der ikke skal på listen
      </h2>
      <p className="mt-0.5 text-[13px] text-muted">Det I altid har hjemme, trækkes fra indkøbslisten.</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {pantry.map((item) => (
          <li key={item}>
            <button
              type="button"
              aria-label={`Fjern ${item} fra basisvarer`}
              onClick={() => onChange(pantry.filter((candidate) => candidate !== item))}
              className="flex h-11 items-center gap-1.5 rounded-full bg-raised pl-4 pr-3 text-[15px] text-ink-2"
            >
              {item}
              <X size={15} aria-hidden="true" className="text-muted" />
            </button>
          </li>
        ))}
        {pantry.length === 0 ? <li className="text-sm text-muted">Ingen basisvarer endnu.</li> : null}
      </ul>
      <form onSubmit={add} className="mt-3 flex h-11 items-center gap-2 rounded-full border border-line pl-4 pr-1">
        <label className="flex-1">
          <span className="sr-only">Tilføj basisvare</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Tilføj basisvare"
            autoComplete="off"
            maxLength={60}
            className="h-11 w-full border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
          />
        </label>
        <button
          type="submit"
          aria-label="Tilføj basisvare"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-ink"
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
