import { Link } from "react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Heart, Repeat2, Snowflake, Sparkles } from "lucide-react";
import type { Dish, DishPreview } from "@madplan/domain";
import { errorMessage, useDishActions } from "@/api/library-mutations";
import { Field, inputClass } from "@/components/ui/Field";
import { parseLines } from "@/lib/chips";
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
import { dishImageSrc } from "@/lib/images";
import { plural } from "@/lib/library";
import { notify } from "@/lib/notify";
import { routePath } from "@/lib/route";
import { useRoute } from "@/hooks/use-route";
import { ImageField } from "./ImageField";

export type DishFormProps = {
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

const textarea = `${inputClass} h-auto min-h-[132px] py-3 leading-relaxed`;
const MAX_CATEGORY_CHIPS = 10;

function Flag({ label, icon, checked, onChange }: { label: string; icon: ReactNode; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-line px-2 text-sm text-ink-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
      <span className="hidden sm:inline-flex">{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
    </label>
  );
}

/**
 * The dish form, filling its sheet: fields scroll, "Annullér" and "Gem ret" stay at the bottom.
 * Used for editing a dish and as the last step of "Tilføj ret".
 */
export function DishForm({ dish, preview, dishes, aiAvailable, categories, onClose }: DishFormProps) {
  const { navigate } = useRoute();
  const actions = useDishActions();
  const [draft, setDraft] = useState<DishDraft>(() => (dish ? draftFromDish(dish) : preview ? draftFromDish(preview.dish) : emptyDraft()));
  const [errors, setErrors] = useState<DishErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | undefined>();
  const [filling, setFilling] = useState(false);
  const [fillError, setFillError] = useState<string | undefined>();
  const [filled, setFilled] = useState<DishPreview | undefined>();

  useEffect(() => {
    setDraft(dish ? draftFromDish(dish) : preview ? draftFromDish(preview.dish) : emptyDraft());
    setErrors({});
    setServerError(undefined);
    setFillError(undefined);
    setFilled(undefined);
  }, [dish, preview]);

  const set = <K extends keyof DishDraft>(key: K, value: DishDraft[K]): void =>
    setDraft((current) => ({ ...current, [key]: value }));

  const duplicate = dish ? undefined : findDuplicate(draft.name, dishes);
  const origin = preview ?? filled;
  const ingredientCount = parseLines(draft.ingredients).length;
  const stepCount = parseLines(draft.steps).length;
  const chips = categories.slice(0, MAX_CATEGORY_CHIPS);

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

  const showFill = !dish && !preview && aiAvailable;

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <div className="flex flex-col gap-5">
          {preview ? <PreviewNote preview={preview} /> : null}
          <ImageField value={draft.imageUrl} onChange={(value) => set("imageUrl", value)} fallback={dish?.imageKey ? dishImageSrc(dish) : undefined} />

          <div className="flex flex-col gap-2">
            <Field label="Navn" error={errors.name}>
              <input
                value={draft.name}
                onChange={(event) => set("name", event.target.value)}
                className={`${inputClass} h-14 text-[17px] font-semibold`}
                autoComplete="off"
                placeholder="Fx Mormors frikadeller"
              />
            </Field>
            {duplicate ? (
              <p role="status" className="m-0 flex items-start gap-2 rounded-2xl bg-offer-soft px-3 py-2.5 text-sm text-ink">
                <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-offer" />
                <span>
                  Der findes allerede en ret, der hedder {duplicate.name}
                  {duplicate.archivedAt ? " (i arkivet)" : ""}.{" "}
                  <Link to={routePath({ name: "retter", dishId: duplicate.id })} onClick={onClose} className="font-semibold text-accent">
                    Åbn den
                  </Link>
                </span>
              </p>
            ) : null}
          </div>

          {showFill ? (
            <div className="flex flex-col gap-3 rounded-2xl bg-accent-soft p-4">
              <div className="flex items-start gap-2.5">
                <Sparkles size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
                <p className="m-0 text-sm text-ink-2" role={fillError ? "alert" : filled ? "status" : undefined}>
                  {fillError ? (
                    <span className="text-danger">{fillError}</span>
                  ) : filled ? (
                    "AI har udfyldt de tomme felter. Ret dem til, så de passer til jer."
                  ) : (
                    "Skriv navnet, så foreslår AI kategori, tid, ingredienser og fremgangsmåde."
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fill()}
                disabled={filling}
                className="flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent disabled:opacity-60"
              >
                <Sparkles size={16} aria-hidden="true" />
                {filling ? "Skriver opskriften…" : hasEmptyFields(draft) ? "Udfyld resten med AI" : "Udfyld tomme felter med AI"}
              </button>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Field label="Kategori" error={errors.category}>
              <input value={draft.category} onChange={(event) => set("category", event.target.value)} className={inputClass} autoComplete="off" />
            </Field>
            {chips.length > 0 ? (
              <div className="no-scrollbar -mx-6 flex gap-1.5 overflow-x-auto px-6" role="group" aria-label="Brugt før">
                {chips.map((name) => {
                  const active = draft.category.trim().toLocaleLowerCase("da-DK") === name.toLocaleLowerCase("da-DK");
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={active}
                      onClick={() => set("category", name)}
                      className={`h-9 shrink-0 rounded-full px-3.5 text-sm ${active ? "bg-ink font-semibold text-ground" : "bg-raised text-ink-2 hover:text-ink"}`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Minutter" error={errors.prepMinutes}>
              <input inputMode="numeric" value={draft.prepMinutes} onChange={(event) => set("prepMinutes", event.target.value)} className={inputClass} />
            </Field>
            <Field label="Portioner" error={errors.servings}>
              <input inputMode="numeric" value={draft.servings} onChange={(event) => set("servings", event.target.value)} className={inputClass} placeholder="Valgfrit" />
            </Field>
          </div>

          <Field
            label="Ingredienser"
            error={errors.ingredients}
            hint={ingredientCount > 0 ? `${plural(ingredientCount, "ingrediens", "ingredienser")} · én pr. linje` : "Én ingrediens pr. linje, fx “500 g hakket oksekød”."}
          >
            <textarea value={draft.ingredients} onChange={(event) => set("ingredients", event.target.value)} className={textarea} rows={6} />
          </Field>
          <Field label="Fremgangsmåde" hint={stepCount > 0 ? `${plural(stepCount, "trin", "trin")} · ét pr. linje` : "Ét trin pr. linje."}>
            <textarea value={draft.steps} onChange={(event) => set("steps", event.target.value)} className={textarea} rows={6} />
          </Field>

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-sm font-semibold text-ink-2">Kendetegn</legend>
            <div className="grid grid-cols-3 gap-2">
              <Flag label="Favorit" icon={<Heart size={15} aria-hidden="true" className="shrink-0" />} checked={draft.favorite} onChange={(value) => set("favorite", value)} />
              <Flag label="Gode rester" icon={<Repeat2 size={15} aria-hidden="true" className="shrink-0" />} checked={draft.leftoverFriendly} onChange={(value) => set("leftoverFriendly", value)} />
              <Flag label="Kan fryses" icon={<Snowflake size={15} aria-hidden="true" className="shrink-0" />} checked={draft.freezerFriendly} onChange={(value) => set("freezerFriendly", value)} />
            </div>
          </fieldset>

          <Field label="Link til original opskrift" error={errors.sourceUrl} hint="Valgfrit">
            <input type="url" inputMode="url" value={draft.sourceUrl} onChange={(event) => set("sourceUrl", event.target.value)} className={inputClass} placeholder="https://…" />
          </Field>

          {serverError ? (
            <p role="alert" className="m-0 rounded-2xl bg-offer-soft p-3 text-[15px] text-offer">
              {serverError}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex gap-2.5 border-t border-hairline px-6 pb-4 pt-3">
        <button type="button" onClick={onClose} className="h-12 flex-1 rounded-full border border-line text-[15px] font-semibold text-ink hover:bg-raised">
          Annullér
        </button>
        <button type="submit" disabled={saving || filling} className="h-12 flex-[2] rounded-full bg-accent text-[15px] font-semibold text-on-accent disabled:opacity-60">
          {saving ? "Gemmer…" : "Gem ret"}
        </button>
      </div>
    </form>
  );
}

/** Where the recipe came from and what to check before saving it: one line, details folded away. */
function PreviewNote({ preview }: { preview: DishPreview }) {
  const { how, review } = preview;
  const box = "m-0 flex items-start gap-2.5 rounded-2xl p-3.5 text-sm";
  if (how === "read" || how === "drafted") {
    return (
      <p className={`${box} bg-accent-soft text-ink`}>
        <Sparkles size={17} aria-hidden="true" className="mt-px shrink-0 text-accent" />
        {how === "read" ? "AI har læst opskriften. Se især mængderne efter, før du gemmer." : "AI har skrevet opskriften. Ret den til, så den passer til jer."}
      </p>
    );
  }
  if (!review?.checked) {
    return (
      <p className={`${box} bg-raised text-ink-2`}>
        <AlertTriangle size={17} aria-hidden="true" className="mt-px shrink-0 text-offer" />
        Opskriften kunne ikke tjekkes automatisk. Se ingredienserne efter, før du gemmer.
      </p>
    );
  }
  if (review.changes.length === 0) {
    return (
      <p className={`${box} bg-raised text-ink-2`}>
        <CheckCircle2 size={17} aria-hidden="true" className="mt-px shrink-0 text-ok" />
        Opskriften er tjekket. Der var intet at rette.
      </p>
    );
  }
  return (
    <details className="group rounded-2xl bg-raised text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 p-3.5 [&::-webkit-details-marker]:hidden">
        <CheckCircle2 size={17} aria-hidden="true" className="shrink-0 text-ok" />
        <span className="flex-1 text-ink">
          <span className="font-semibold">Opskriften er tjekket og rettet</span>
          <span className="text-muted"> · {plural(review.changes.length, "rettelse", "rettelser")}</span>
        </span>
        <ChevronDown size={17} aria-hidden="true" className="shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <ul className="m-0 list-disc pb-3.5 pl-12 pr-4 text-ink-2">
        {review.changes.map((change) => (
          <li key={change}>{change}</li>
        ))}
      </ul>
    </details>
  );
}
