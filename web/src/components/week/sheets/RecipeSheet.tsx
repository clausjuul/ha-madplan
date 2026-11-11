import { Link } from "react-router";
import { Clock } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { DishImage } from "@/components/ui/DishImage";
import { routePath } from "@/lib/route";
import type { DayModel } from "@/lib/week-model";

type Props = { day: DayModel | null; onClose: () => void };

/** Simple recipe overview for this phase; the full cook mode comes later. */
export function RecipeSheet({ day, onClose }: Props) {
  const dish = day?.dish;
  return (
    <Sheet open={Boolean(day && dish)} onClose={onClose} title={dish?.name ?? ""} subtitle={day?.longLabel} tall>
      {dish ? (
        <div className="flex flex-col gap-4 px-3 pb-2">
          <DishImage dish={dish} width={520} height={200} className="h-[200px] w-full rounded-2xl" />
          <div className="flex flex-wrap gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-sm text-ink-2">
              <Clock size={15} aria-hidden="true" />
              {dish.prepMinutes} min
            </span>
            <span className="rounded-full bg-raised px-3 py-1.5 text-sm text-ink-2">{dish.category}</span>
          </div>
          {dish.ingredients.length > 0 ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-muted">Ingredienser</h3>
              <ul className="m-0 list-disc pl-5 text-[15px] leading-relaxed text-ink-2">
                {dish.ingredients.map((ingredient) => (
                  <li key={ingredient}>{ingredient}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {dish.instructions && dish.instructions.length > 0 ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-muted">Fremgangsmåde</h3>
              <ol className="m-0 pl-5 text-[15px] leading-relaxed text-ink-2">
                {dish.instructions.map((step) => (
                  <li key={step} className="mb-1.5">
                    {step}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          <Link
            to={routePath({ name: "lav-mad", dishId: dish.id })}
            className="flex h-12 items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-ground no-underline"
          >
            Lav mad
          </Link>
        </div>
      ) : null}
    </Sheet>
  );
}
