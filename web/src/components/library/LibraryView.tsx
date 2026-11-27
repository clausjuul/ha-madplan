import { Link } from "react-router";
import { useMemo, useState } from "react";
import type { Dish, DishPreview } from "@madplan/domain";
import { useBootstrap } from "@/api/queries";
import { ErrorState } from "@/components/ui/StatusViews";
import { useToday } from "@/hooks/use-today";
import { categoriesOf } from "@/lib/library";
import { routePath, type LibraryTab } from "@/lib/route";
import { Discover } from "./Discover";
import { AddRecipeSheet } from "./AddRecipeSheet";
import { BulkAddSheet } from "./BulkAddSheet";
import { DishFormSheet } from "./DishFormSheet";
import { OurDishes } from "./OurDishes";
import { RecipeDetail } from "./RecipeDetail";
import { SavedRecipes } from "./SavedRecipes";
import { WeeklyPlans } from "./WeeklyPlans";

type Props = { dishId?: string; tab?: LibraryTab };
/** The form: editing a dish, a new one (from scratch or from a read recipe), or closed. */
type Editing = { dish?: Dish; preview?: DishPreview } | null;
type Adding = "recipe" | "bulk" | null;

const tabClass = (active: boolean): string =>
  `flex h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-[15px] no-underline sm:px-5 ${
    active ? "bg-ink font-semibold text-ground" : "font-medium text-ink-2 hover:text-ink"
  }`;

export function LibraryView({ dishId, tab }: Props) {
  const today = useToday();
  const bootstrap = useBootstrap();
  const data = bootstrap.data;
  const [editing, setEditing] = useState<Editing>(null);
  const [adding, setAdding] = useState<Adding>(null);
  const categories = useMemo(() => categoriesOf(data?.dishes ?? []), [data?.dishes]);

  if (bootstrap.isError && !data) return <ErrorState error={bootstrap.error} onRetry={() => void bootstrap.refetch()} />;
  if (!data) return <div className="skeleton m-6 h-64 rounded-3xl" aria-busy="true" aria-label="Henter retter" />;

  const dish = dishId ? data.dishes.find((candidate) => candidate.id === dishId) : undefined;

  let body;
  if (dishId) {
    body = dish ? (
      <RecipeDetail dish={dish} data={data} today={today} onEdit={(target) => setEditing({ dish: target })} />
    ) : (
      <div className="rounded-3xl bg-surface p-10 text-center">
        <p className="mb-4 text-[15px] text-ink-2">Retten findes ikke (længere).</p>
        <Link to={routePath({ name: "retter" })} className="text-accent">Tilbage til retterne</Link>
      </div>
    );
  } else {
    body = (
      <>
        <nav role="tablist" aria-label="Retter" className="no-scrollbar flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1">
          <Link role="tab" aria-selected={!tab} to={routePath({ name: "retter" })} className={tabClass(!tab)}>
            Vores
          </Link>
          <Link role="tab" aria-selected={tab === "opdag"} to={routePath({ name: "retter", tab: "opdag" })} className={tabClass(tab === "opdag")}>
            Opdag
          </Link>
          <Link role="tab" aria-selected={tab === "ugens"} to={routePath({ name: "retter", tab: "ugens" })} className={tabClass(tab === "ugens")}>
            Madsider
          </Link>
          <Link role="tab" aria-selected={tab === "gemt"} to={routePath({ name: "retter", tab: "gemt" })} className={tabClass(tab === "gemt")}>
            Gemt{data.savedInspirations.length > 0 ? ` (${data.savedInspirations.length})` : ""}
          </Link>
        </nav>
        {tab === "opdag" ? (
          <Discover data={data} />
        ) : tab === "ugens" ? (
          <WeeklyPlans data={data} />
        ) : tab === "gemt" ? (
          <SavedRecipes data={data} />
        ) : (
          <OurDishes
            data={data}
            today={today}
            onCreate={() => setEditing({})}
            onAddRecipe={() => setAdding("recipe")}
            {...(data.capabilities.openai ? { onBulkAdd: () => setAdding("bulk") } : {})}
          />
        )}
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 pb-8 pt-4 md:px-6 md:pt-6 lg:px-8">
      {body}
      <DishFormSheet
        open={editing !== null}
        dish={editing?.dish}
        preview={editing?.preview}
        dishes={data.dishes}
        aiAvailable={data.capabilities.openai}
        categories={categories}
        onClose={() => setEditing(null)}
      />
      <AddRecipeSheet
        open={adding === "recipe"}
        aiAvailable={data.capabilities.openai}
        onClose={() => setAdding(null)}
        onPreview={(preview) => {
          setAdding(null);
          setEditing({ preview });
        }}
      />
      <BulkAddSheet open={adding === "bulk"} dishes={data.dishes} onClose={() => setAdding(null)} />
    </div>
  );
}
