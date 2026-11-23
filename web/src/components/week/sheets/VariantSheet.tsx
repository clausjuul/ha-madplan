import { useState } from "react";
import { Link } from "react-router";
import { routePath } from "@/lib/route";
import { parseIngredient, type MealVariant, type Profile } from "@madplan/domain";
import { Sheet } from "@/components/ui/Sheet";
import { chipClass } from "@/components/plan/Stepper";
import type { DayModel } from "@/lib/week-model";

type Props = {
  day: DayModel | null;
  profiles: readonly Profile[];
  onSave: (variants: MealVariant[]) => void;
  onClose: () => void;
};

type Choice = { replaces: string; with: string } | null;

function VariantForm({ day, profiles, onSave }: { day: DayModel; profiles: readonly Profile[]; onSave: Props["onSave"] }) {
  const swappers = profiles.filter((profile) => profile.active && profile.safeFoods?.length);
  const parts = [...new Set((day.dish?.ingredients ?? []).map((ingredient) => parseIngredient(ingredient).name))];
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(
      swappers.map((profile) => {
        const existing = day.meal?.variants?.find((variant) => variant.profileId === profile.id);
        return [profile.id, existing ? { replaces: existing.replaces, with: existing.with } : null];
      }),
    ),
  );

  if (!swappers.length) {
    return (
      <div className="mx-3 mb-3 flex flex-col items-start gap-3 rounded-2xl bg-raised px-4 py-3 text-[15px] leading-snug text-ink-2">
        <p className="m-0">
          Skriv under Familien, hvad en person altid spiser (fx nuggets). Så kan du her bytte én del af retten for dem.
        </p>
        <Link to={routePath({ name: "indstillinger" })} className="flex min-h-11 items-center font-semibold text-accent">
          Gå til Familien
        </Link>
      </div>
    );
  }

  const set = (profileId: string, choice: Choice): void => setChoices({ ...choices, [profileId]: choice });
  // A swap without "i stedet for" would put the wrong thing on the shopping list.
  const incomplete = Object.values(choices).some((choice) => choice !== null && !choice.replaces);

  return (
    <form
      className="flex flex-col gap-5 px-3 pb-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(
          Object.entries(choices).flatMap(([profileId, choice]) =>
            choice?.replaces && choice.with ? [{ profileId, replaces: choice.replaces, with: choice.with }] : [],
          ),
        );
      }}
    >
      <p className="m-0 text-[15px] leading-snug text-muted">
        Resten af retten er den samme. Indkøbslisten tager højde for byttet.
      </p>
      {swappers.map((profile) => {
        const choice = choices[profile.id] ?? null;
        return (
          <fieldset key={profile.id} className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2 text-base font-semibold">{profile.name}</legend>
            <div role="group" aria-label={`${profile.name} får i stedet`} className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={choice === null} onClick={() => set(profile.id, null)} className={chipClass(choice === null)}>
                Det samme som os
              </button>
              {(profile.safeFoods ?? []).map((food) => (
                <button
                  key={food}
                  type="button"
                  aria-pressed={choice?.with === food}
                  onClick={() => set(profile.id, { replaces: choice?.replaces ?? "", with: food })}
                  className={chipClass(choice?.with === food)}
                >
                  {food}
                </button>
              ))}
            </div>
            {choice ? (
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-2">
                i stedet for
                <select
                  value={choice.replaces}
                  onChange={(event) => set(profile.id, { ...choice, replaces: event.target.value })}
                  aria-invalid={!choice.replaces}
                  className="h-12 rounded-2xl border border-line bg-ground px-4 text-[15px] font-normal text-ink"
                >
                  <option value="" disabled>
                    Vælg hvad det erstatter
                  </option>
                  {parts.map((part) => (
                    <option key={part} value={part}>
                      {part}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </fieldset>
        );
      })}
      {incomplete ? <p className="m-0 text-sm text-muted">Vælg, hvad det erstatter, før du gemmer.</p> : null}
      <button
        type="submit"
        disabled={incomplete}
        className="h-12 rounded-full bg-accent text-[15px] font-semibold text-on-accent disabled:opacity-50"
      >
        Gem
      </button>
    </form>
  );
}

/** "Særlig ret til én": e.g. nuggets instead of the steak for one person, the rest of the dish the same. */
export function VariantSheet({ day, profiles, onSave, onClose }: Props) {
  return (
    <Sheet open={day !== null} onClose={onClose} title="Særlig ret til én" subtitle={day?.dish?.name}>
      {day ? <VariantForm key={day.date} day={day} profiles={profiles} onSave={onSave} /> : null}
    </Sheet>
  );
}
