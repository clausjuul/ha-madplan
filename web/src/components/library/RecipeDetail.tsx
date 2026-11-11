import { Link } from "react-router";
import { useState } from "react";
import { Archive, ArrowLeft, CalendarPlus, Clock, ExternalLink, Pencil, RotateCcw, Snowflake, Soup, Users } from "lucide-react";
import { createHistoryInsights, type BootstrapResponse, type Dish } from "@madplan/domain";
import { errorMessage, useDishActions } from "@/api/library-mutations";
import { DishImage } from "@/components/ui/DishImage";
import { Sheet } from "@/components/ui/Sheet";
import { lastEatenLabel, plural } from "@/lib/library";
import { notify } from "@/lib/notify";
import { routePath } from "@/lib/route";
import { useRoute } from "@/hooks/use-route";
import { PlanDaySheet } from "./PlanDaySheet";

type Props = { dish: Dish; data: BootstrapResponse; today: string; onEdit: (dish: Dish) => void };

const pill = "flex h-9 items-center gap-1.5 rounded-full bg-raised px-3.5 text-sm text-ink-2";
const action =
  "flex h-12 items-center justify-center gap-2 rounded-full border border-line px-5 text-[15px] font-semibold text-ink no-underline hover:bg-raised";

export function RecipeDetail({ dish, data, today, onEdit }: Props) {
  const { navigate } = useRoute();
  const actions = useDishActions();
  const [planning, setPlanning] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const last = createHistoryInsights(data.meals, [dish], today).lastEatenByDish.get(dish.id);

  const restore = (): void => {
    actions.restore(dish.id).catch((error: unknown) => notify(errorMessage(error)));
  };
  const archive = (): void => {
    setConfirmArchive(false);
    actions
      .archive(dish.id)
      .then(() => {
        navigate({ name: "retter" });
        notify(`${dish.name} er arkiveret. Historikken er bevaret.`, 9000, { label: "Fortryd", run: restore });
      })
      .catch((error: unknown) => notify(errorMessage(error)));
  };

  return (
    <article className="flex flex-col gap-6">
      <Link to={routePath({ name: "retter" })} className="flex h-11 w-fit items-center gap-2 text-[15px] text-ink-2 no-underline hover:text-ink">
        <ArrowLeft size={18} aria-hidden="true" />
        Alle retter
      </Link>

      {/* Split card on tablets (photo capped at 520px so small bundled photos stay sharp), full-width photo on phones. */}
      <header className="overflow-hidden rounded-[28px] bg-surface md:grid md:grid-cols-[minmax(0,520px)_minmax(0,1fr)] md:grid-rows-[1fr_auto]">
        <DishImage dish={dish} width={520} height={300} eager decorative className="h-[220px] w-full md:row-span-2 md:h-[300px]" />
        <div className="flex flex-col gap-3 p-5 md:p-7 md:pb-0">
          <h1 className="font-display text-[30px] font-bold leading-tight md:text-[40px]">{dish.name}</h1>
          <div className="flex flex-wrap gap-2">
            <span className={pill}>{dish.category}</span>
            <span className={pill}>
              <Clock size={15} aria-hidden="true" />
              {dish.prepMinutes} min
            </span>
            {dish.servings ? (
              <span className={pill}>
                <Users size={15} aria-hidden="true" />
                {plural(dish.servings, "portion", "portioner")}
              </span>
            ) : null}
            {dish.leftoverFriendly ? (
              <span className={pill}>
                <Soup size={15} aria-hidden="true" />
                Gode rester
              </span>
            ) : null}
            {dish.freezerFriendly ? (
              <span className={pill}>
                <Snowflake size={15} aria-hidden="true" />
                Kan fryses
              </span>
            ) : null}
            <span className={pill}>{lastEatenLabel(last, today)}</span>
          </div>
        </div>

      <div className="p-5 pt-0 md:px-7 md:pb-7 md:pt-5">
      {dish.archivedAt ? (
        <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-offer-soft p-4 text-offer">
          <p className="m-0 min-w-0 flex-1 text-[15px]">Retten er arkiveret og vises ikke i forslag. Historikken er bevaret.</p>
          <button type="button" onClick={restore} className="flex h-12 items-center gap-2 rounded-full bg-offer px-5 text-[15px] font-semibold text-on-offer">
            <RotateCcw size={17} aria-hidden="true" />
            Gendan
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          <Link to={routePath({ name: "lav-mad", dishId: dish.id })} className="flex h-12 items-center rounded-full bg-accent px-7 text-[15px] font-semibold text-on-accent no-underline">
            Lav mad
          </Link>
          <button type="button" onClick={() => setPlanning(true)} className={action}>
            <CalendarPlus size={18} aria-hidden="true" />
            Planlæg
          </button>
          <button type="button" onClick={() => onEdit(dish)} className={action}>
            <Pencil size={17} aria-hidden="true" />
            Redigér
          </button>
          <button type="button" onClick={() => setConfirmArchive(true)} className={action}>
            <Archive size={17} aria-hidden="true" />
            Arkivér
          </button>
        </div>
      )}
      </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="rounded-3xl bg-surface p-6">
          <h2 className="font-display mb-3 text-xl font-bold">Ingredienser</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[15px] text-ink-2">
            {dish.ingredients.map((ingredient, index) => (
              <li key={`${ingredient}-${index}`} className="border-b border-hairline pb-2 last:border-0">
                {ingredient}
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-3xl bg-surface p-6">
          <h2 className="font-display mb-3 text-xl font-bold">Fremgangsmåde</h2>
          {dish.instructions && dish.instructions.length > 0 ? (
            <ol className="m-0 flex list-none flex-col gap-3 p-0 text-[15px] leading-relaxed text-ink-2">
              {dish.instructions.map((step, index) => (
                <li key={`${index}-${step}`} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-raised text-sm font-semibold text-accent">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="m-0 text-[15px] text-muted">Der er ikke skrevet en fremgangsmåde til denne ret endnu.</p>
          )}
          {dish.sourceUrl ? (
            <a href={dish.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-5 flex h-11 w-fit items-center gap-2 text-[15px] font-semibold text-accent no-underline">
              <ExternalLink size={16} aria-hidden="true" />
              Se original opskrift
            </a>
          ) : null}
        </section>
      </div>

      <PlanDaySheet open={planning} dish={dish} data={data} today={today} onClose={() => setPlanning(false)} />
      <Sheet open={confirmArchive} onClose={() => setConfirmArchive(false)} title={`Arkivér ${dish.name}?`}>
        <div className="flex flex-col gap-4 px-3 pb-2">
          <p className="m-0 text-[15px] leading-relaxed text-ink-2">
            Retten skjules fra forslag og planlægning. Historikken bevares: tidligere uger og hvor ofte I har spist
            den ændres ikke, og du kan altid gendanne retten under Arkiveret.
          </p>
          <div className="flex gap-2.5">
            <button type="button" onClick={() => setConfirmArchive(false)} className={`${action} flex-1`}>
              Annullér
            </button>
            <button type="button" onClick={archive} className="flex h-12 flex-1 items-center justify-center rounded-full bg-offer px-5 text-[15px] font-semibold text-on-offer">
              Arkivér
            </button>
          </div>
        </div>
      </Sheet>
    </article>
  );
}
