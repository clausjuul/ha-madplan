import { Link } from "react-router";
import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import type { Dish, DishPreview } from "@madplan/domain";
import { errorMessage, useDishActions } from "@/api/library-mutations";
import { Field, inputClass } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import {
  draftFromDish,
  draftToInput,
  emptyDraft,
  fillEmpty,
  findDuplicate,
  hasEmptyFields,
  validateDraft,
  type DishDraft,
  type DishErrors,
} from "@/lib/dish-form";
import { notify } from "@/lib/notify";
import { routePath } from "@/lib/route";
import { useRoute } from "@/hooks/use-route";
import { ImageField } from "./ImageField";

type Props = {
  open: boolean;
  /** The dish being edited, or undefined to create a new one. */
  dish?: Dish;
  /** A recipe read from a link, text or photo (not saved yet) to start the new dish from. */
  preview?: DishPreview;
  /** All dishes, to warn about a dish that already exists. */
  dishes: readonly Dish[];
  /** OpenAI is set up, so "Udfyld med AI" can be offered. */
  aiAvailable: boolean;
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

export function DishFormSheet({ open, dish, preview, dishes, aiAvailable, categories, onClose }: Props) {
  const { navigate } = useRoute();
  const actions = useDishActions();
  const [draft, setDraft] = useState<DishDraft>(emptyDraft);
  const [errors, setErrors] = useState<DishErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | undefined>();
  const [filling, setFilling] = useState(false);
  const [fillError, setFillError] = useState<string | undefined>();
  const [filled, setFilled] = useState<DishPreview | undefined>();

  useEffect(() => {
    if (!open) return;
    setDraft(dish ? draftFromDish(dish) : preview ? draftFromDish(preview.dish) : emptyDraft());
    setErrors({});
    setServerError(undefined);
    setFillError(undefined);
    setFilled(undefined);
  }, [open, dish, preview]);

  const set = <K extends keyof DishDraft>(key: K, value: DishDraft[K]): void =>
    setDraft((current) => ({ ...current, [key]: value }));

  const duplicate = dish ? undefined : findDuplicate(draft.name, dishes);
  const origin = preview ?? filled;

  const fill = async (): Promise<void> => {
    if (!draft.name.trim()) {
      setErrors((current) => ({ ...current, name: "Skriv rettens navn først." }));
      return;
    }
    setFilling(true);
    setFillError(undefined);
    try {
      const result = await actions.draft({ name: draft.name.trim() });
      setDraft((current) => fillEmpty(current, result.dish));
      setFilled(result);
      setErrors({});
    } catch (error) {
      setFillError(errorMessage(error));
    } finally {
      setFilling(false);
    }
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setServerError(undefined);
    try {
      const input = draftToInput(draft, dish ?? origin?.dish);
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

  const title = dish ? "Redigér ret" : preview ? "Se opskriften igennem" : "Ny ret";
  const showFill = !dish && !preview && aiAvailable;

  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={preview ? "Den gemmes først, når du trykker Gem ret" : undefined} tall>
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4 px-3 pb-2">
        {preview ? <PreviewNote preview={preview} /> : null}
        <Field label="Navn" error={errors.name}>
          <input value={draft.name} onChange={(event) => set("name", event.target.value)} className={inputClass} autoComplete="off" />
        </Field>
        {duplicate ? (
          <p role="status" className="-mt-2 m-0 flex items-start gap-2 text-sm text-ink-2">
            <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-offer" />
            <span>
              Der findes allerede en ret, der hedder {duplicate.name}
              {duplicate.archivedAt ? " (i arkivet)" : ""}.{" "}
              <Link to={routePath({ name: "retter", dishId: duplicate.id })} onClick={onClose} className="text-accent">
                Åbn den
              </Link>
            </span>
          </p>
        ) : null}
        {showFill ? (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => void fill()}
              disabled={filling}
              className="flex h-12 items-center justify-center gap-2 rounded-full border border-line px-5 text-[15px] font-semibold text-accent disabled:opacity-60"
            >
              <Sparkles size={17} aria-hidden="true" />
              {filling ? "Skriver opskriften…" : hasEmptyFields(draft) ? "Udfyld resten med AI" : "Udfyld tomme felter med AI"}
            </button>
            {fillError ? (
              <p role="alert" className="m-0 text-[13px] text-danger">{fillError}</p>
            ) : filled ? (
              <p role="status" className="m-0 text-[13px] text-muted">AI har udfyldt de tomme felter. Ret dem til, så de passer til jer.</p>
            ) : (
              <p className="m-0 text-[13px] text-muted">Skriv navnet, så foreslår AI kategori, tid, ingredienser og fremgangsmåde.</p>
            )}
          </div>
        ) : null}
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
          <button type="submit" disabled={saving || filling} className="h-12 flex-1 rounded-full bg-accent text-[15px] font-semibold text-on-accent disabled:opacity-60">
            {saving ? "Gemmer…" : "Gem ret"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** Where the recipe came from and what to check before saving it. */
function PreviewNote({ preview }: { preview: DishPreview }) {
  const { how, review } = preview;
  if (how === "read") {
    return (
      <p className="m-0 flex items-start gap-2 rounded-2xl bg-accent-soft p-3 text-[15px] text-ink">
        <Sparkles size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
        AI har læst opskriften. Se især mængderne efter, før du gemmer.
      </p>
    );
  }
  if (how === "drafted") {
    return (
      <p className="m-0 flex items-start gap-2 rounded-2xl bg-accent-soft p-3 text-[15px] text-ink">
        <Sparkles size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
        AI har skrevet opskriften. Ret den til, så den passer til jer.
      </p>
    );
  }
  if (!review?.checked) {
    return <p className="m-0 text-sm text-muted">Opskriften kunne ikke tjekkes automatisk. Se ingredienserne efter, før du gemmer.</p>;
  }
  if (review.changes.length === 0) {
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-muted">
        <CheckCircle2 size={16} aria-hidden="true" className="text-ok" />
        Opskriften er tjekket. Der var intet at rette.
      </p>
    );
  }
  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="m-0 flex items-center gap-2 text-[15px] font-semibold">
        <CheckCircle2 size={18} aria-hidden="true" className="text-ok" />
        Opskriften er tjekket og rettet
      </p>
      <ul className="mb-0 mt-2 list-disc pl-5 text-sm text-ink-2">
        {review.changes.map((change) => (
          <li key={change}>{change}</li>
        ))}
      </ul>
    </div>
  );
}
