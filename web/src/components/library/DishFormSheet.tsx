import { useEffect, useState, type FormEvent } from "react";
import type { Dish } from "@madplan/domain";
import { errorMessage, useDishActions } from "@/api/library-mutations";
import { Field, inputClass } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import {
  draftFromDish,
  draftToInput,
  emptyDraft,
  validateDraft,
  type DishDraft,
  type DishErrors,
} from "@/lib/dish-form";
import { notify } from "@/lib/notify";
import { useRoute } from "@/hooks/use-route";
import { ImageField } from "./ImageField";

type Props = {
  open: boolean;
  /** The dish being edited, or undefined to create a new one. */
  dish?: Dish;
  categories: readonly string[];
  onClose: () => void;
};

const textarea = `${inputClass} h-auto min-h-[120px] py-3 leading-relaxed`;

function Flag({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex h-12 cursor-pointer items-center gap-3 rounded-2xl bg-ground px-4 text-[15px] text-ink">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-[var(--c-accent)]" />
      {label}
    </label>
  );
}

export function DishFormSheet({ open, dish, categories, onClose }: Props) {
  const { navigate } = useRoute();
  const actions = useDishActions();
  const [draft, setDraft] = useState<DishDraft>(emptyDraft);
  const [errors, setErrors] = useState<DishErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    setDraft(dish ? draftFromDish(dish) : emptyDraft());
    setErrors({});
    setServerError(undefined);
  }, [open, dish]);

  const set = <K extends keyof DishDraft>(key: K, value: DishDraft[K]): void =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setServerError(undefined);
    try {
      const input = draftToInput(draft, dish);
      const saved = dish ? await actions.update(dish.id, input) : await actions.create(input);
      notify(dish ? "Ændringerne er gemt." : `${saved.name} er tilføjet til dine retter.`);
      onClose();
      if (!dish) navigate({ name: "retter", dishId: saved.id });
    } catch (error) {
      setServerError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={dish ? "Redigér ret" : "Ny ret"} tall>
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4 px-3 pb-2">
        <Field label="Navn" error={errors.name}>
          <input value={draft.name} onChange={(event) => set("name", event.target.value)} className={inputClass} autoComplete="off" />
        </Field>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Kategori" error={errors.category} className="col-span-2 sm:col-span-1">
            <input list="dish-categories" value={draft.category} onChange={(event) => set("category", event.target.value)} className={inputClass} autoComplete="off" />
          </Field>
          <Field label="Minutter" error={errors.prepMinutes}>
            <input inputMode="numeric" value={draft.prepMinutes} onChange={(event) => set("prepMinutes", event.target.value)} className={inputClass} />
          </Field>
          <Field label="Portioner" error={errors.servings} hint="Valgfrit">
            <input inputMode="numeric" value={draft.servings} onChange={(event) => set("servings", event.target.value)} className={inputClass} />
          </Field>
        </div>
        <datalist id="dish-categories">
          {categories.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <ImageField value={draft.imageUrl} onChange={(value) => set("imageUrl", value)} />
        <Field label="Ingredienser" error={errors.ingredients} hint="Én ingrediens pr. linje, fx “500 g hakket oksekød”.">
          <textarea value={draft.ingredients} onChange={(event) => set("ingredients", event.target.value)} className={textarea} rows={5} />
        </Field>
        <Field label="Fremgangsmåde" hint="Ét trin pr. linje.">
          <textarea value={draft.steps} onChange={(event) => set("steps", event.target.value)} className={textarea} rows={5} />
        </Field>
        <Field label="Link til original opskrift" error={errors.sourceUrl} hint="Valgfrit">
          <input type="url" inputMode="url" value={draft.sourceUrl} onChange={(event) => set("sourceUrl", event.target.value)} className={inputClass} placeholder="https://…" />
        </Field>
        <div className="grid gap-2 sm:grid-cols-3">
          <Flag label="Favorit" checked={draft.favorite} onChange={(value) => set("favorite", value)} />
          <Flag label="Gode rester" checked={draft.leftoverFriendly} onChange={(value) => set("leftoverFriendly", value)} />
          <Flag label="Kan fryses" checked={draft.freezerFriendly} onChange={(value) => set("freezerFriendly", value)} />
        </div>
        {serverError ? (
          <p role="alert" className="m-0 rounded-2xl bg-offer-soft p-3 text-[15px] text-offer">
            {serverError}
          </p>
        ) : null}
        <div className="sticky bottom-0 -mx-3 flex gap-2.5 bg-surface px-3 pb-1 pt-2">
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-full border border-line text-[15px] font-semibold text-ink">
            Annullér
          </button>
          <button type="submit" disabled={saving} className="h-12 flex-1 rounded-full bg-accent text-[15px] font-semibold text-on-accent disabled:opacity-60">
            {saving ? "Gemmer…" : "Gem ret"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
