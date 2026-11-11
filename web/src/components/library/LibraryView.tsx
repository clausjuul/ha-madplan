import { Link } from "react-router";
import { useMemo, useState } from "react";
import type { Dish } from "@madplan/domain";
import { useBootstrap } from "@/api/queries";
import { ErrorState } from "@/components/ui/StatusViews";
import { useToday } from "@/hooks/use-today";
import { categoriesOf } from "@/lib/library";
import { routePath, type LibraryTab } from "@/lib/route";
import { Discover } from "./Discover";
import { DishFormSheet } from "./DishFormSheet";
import { ImportUrlSheet } from "./ImportUrlSheet";
import { OurDishes } from "./OurDishes";
import { RecipeDetail } from "./RecipeDetail";
import { WeeklyPlans } from "./WeeklyPlans";

type Props = { dishId?: string; tab?: LibraryTab };
type Editing = { dish?: Dish } | null;

const tabClass = (active: boolean): string =>
  `flex h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-[15px] no-underline sm:px-5 ${
    active ? "bg-ink font-semibold text-ground" : "font-medium text-ink-2 hover:text-ink"
  }`;

export function LibraryView({ dishId, tab }: Props) {
  const today = useToday();
  const bootstrap = useBootstrap();
  const data = bootstrap.data;
  const [editing, setEditing] = useState<Editing>(null);
  const [importing, setImporting] = useState(false);
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
            Vores retter
          </Link>
          <Link role="tab" aria-selected={tab === "opdag"} to={routePath({ name: "retter", tab: "opdag" })} className={tabClass(tab === "opdag")}>
            Opdag nyt
          </Link>
          <Link role="tab" aria-selected={tab === "ugens"} to={routePath({ name: "retter", tab: "ugens" })} className={tabClass(tab === "ugens")}>
            Ugeplaner
          </Link>
        </nav>
        {tab === "opdag" ? (
          <Discover data={data} />
        ) : tab === "ugens" ? (
          <WeeklyPlans data={data} />
        ) : (
          <OurDishes data={data} today={today} onCreate={() => setEditing({})} onImportUrl={() => setImporting(true)} />
        )}
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 pb-8 pt-4 md:px-6 md:pt-6 lg:px-8">
      {body}
      <DishFormSheet open={editing !== null} dish={editing?.dish} categories={categories} onClose={() => setEditing(null)} />
      <ImportUrlSheet
        open={importing}
        onClose={() => setImporting(false)}
        onEdit={(target) => {
          setImporting(false);
          setEditing({ dish: target });
        }}
      />
    </div>
  );
}
