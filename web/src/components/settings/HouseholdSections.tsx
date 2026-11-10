import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FridgeItem, Settings } from "@madplan/domain";
import { ChipInput } from "@/components/ui/ChipInput";
import { CommitInput, SectionCard, Toggle } from "@/components/ui/Controls";
import { inputClass } from "@/components/ui/Field";

export function ExclusionsSection({ settings, onChange }: { settings: Settings; onChange: (settings: Settings) => void }) {
  return (
    <SectionCard
      title="Undgå altid"
      description="Ingredienser, der aldrig må være med i forslag eller indkøb for hele familien. Skriv én ingrediens ad gangen (fx “skaldyr”), og tryk Enter. Hele sætninger som “ingen skaldyr” virker ikke."
    >
      <ChipInput
        label="Ingredienser at undgå"
        hideLabel
        values={settings.globalExclusions}
        onChange={(globalExclusions) => onChange({ ...settings, globalExclusions })}
        placeholder="Fx skaldyr, koriander"
      />
    </SectionCard>
  );
}

/** Drops empty optional fields so the API never sees "" or false. */
function tidy(item: FridgeItem): FridgeItem {
  return {
    name: item.name,
    ...(item.quantity ? { quantity: item.quantity } : {}),
    ...(item.expiresOn ? { expiresOn: item.expiresOn } : {}),
    ...(item.useFirst ? { useFirst: true } : {}),
  };
}

type FridgeProps = {
  fridge: FridgeItem[];
  pantry: string[];
  onFridge: (items: FridgeItem[]) => void;
  onPantry: (items: string[]) => void;
};

export function FridgeSection({ fridge, pantry, onFridge, onPantry }: FridgeProps) {
  const [name, setName] = useState("");
  const update = (index: number, patch: Partial<FridgeItem>): void =>
    onFridge(fridge.map((item, position) => (position === index ? tidy({ ...item, ...patch }) : item)));
  const add = (): void => {
    if (!name.trim()) return;
    onFridge([...fridge, { name: name.trim() }]);
    setName("");
  };

  return (
    <SectionCard title="Køleskab og basisvarer" description="Det, der er i huset, bruges i forslag og trækkes fra indkøbslisten. “Brug først” prioriteres i planen.">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {fridge.map((item, index) => (
          <li key={`${item.name}-${index}`} className="grid grid-cols-2 items-end gap-3 rounded-3xl bg-raised p-3 md:grid-cols-[1.4fr_1fr_1fr_auto_auto]">
            <div className="col-span-2 md:col-span-1">
              <CommitInput label="Vare" value={item.name} onCommit={(value) => value && update(index, { name: value })} />
            </div>
            <CommitInput label="Mængde" value={item.quantity ?? ""} placeholder="Fx 2 stk." onCommit={(quantity) => update(index, { quantity })} />
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-2">
              Holdbar til
              <input type="date" value={item.expiresOn ?? ""} onChange={(event) => update(index, { expiresOn: event.target.value })} className={inputClass} />
            </label>
            <Toggle label="Brug først" checked={Boolean(item.useFirst)} onChange={(useFirst) => update(index, { useFirst })} />
            <button type="button" aria-label={`Fjern ${item.name}`} onClick={() => onFridge(fridge.filter((_, position) => position !== index))} className="flex h-11 w-11 items-center justify-center justify-self-end rounded-full text-muted hover:text-danger">
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
        {fridge.length === 0 ? <li className="text-[15px] text-muted">Køleskabet er tomt i appen.</li> : null}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <label className="flex-1">
          <span className="sr-only">Ny vare i køleskabet</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Tilføj vare, fx spinat" className={inputClass} />
        </label>
        <button type="submit" className="flex h-12 items-center gap-2 rounded-full border border-line px-5 text-[15px] font-semibold text-ink hover:bg-raised">
          <Plus size={18} aria-hidden="true" />
          Tilføj
        </button>
      </form>
      <ChipInput label="Basisvarer (har altid i huset)" values={pantry} onChange={onPantry} placeholder="Fx salt, olie" />
    </SectionCard>
  );
}
