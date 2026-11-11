import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Info, RefreshCw } from "lucide-react";
import type { BootstrapResponse, WeeklyPlan } from "@madplan/domain";
import { useApi } from "@/api/provider";
import { errorMessage } from "@/api/library-mutations";
import { useWeeklyPlans } from "@/api/queries";
import { ErrorState } from "@/components/ui/StatusViews";
import { notify } from "@/lib/notify";
import { InspirationCard } from "./InspirationCard";
import { useInspirationActions } from "./use-inspiration-actions";

const DAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];

const chip = (active: boolean): string =>
  `flex h-11 shrink-0 items-center rounded-full px-4 text-[15px] ${
    active ? "bg-ink font-semibold text-ground" : "bg-surface text-ink-2 hover:text-ink"
  }`;

const time = (iso: string): string =>
  new Date(iso).toLocaleString("da-DK", { weekday: "short", hour: "2-digit", minute: "2-digit" });

/** Dinner plans that Danish food sites published for this week (and next, once out), with photos. */
export function WeeklyPlans({ data }: { data: BootstrapResponse }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const query = useWeeklyPlans();
  const [week, setWeek] = useState<number | undefined>();
  const [source, setSource] = useState<string>("Alle");
  const [refreshing, setRefreshing] = useState(false);
  const { savedIds, adding, toggleSave, add } = useInspirationActions(data.savedInspirations);
  const ownSources = useMemo(() => new Set(data.dishes.map((dish) => dish.sourceUrl).filter(Boolean)), [data.dishes]);

  const result = query.data;
  const weeks = useMemo(() => [...new Set(result?.plans.map((plan) => plan.week) ?? [])], [result]);
  const shownWeek = week !== undefined && weeks.includes(week) ? week : (result?.week ?? weeks[0]);
  const inWeek = (result?.plans ?? []).filter((plan) => plan.week === shownWeek);
  const sources = [...new Set(inWeek.map((plan) => plan.sourceName))];
  const plans = inWeek.filter((plan) => source === "Alle" || plan.sourceName === source);

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      queryClient.setQueryData(["weekly-plans"], await api.weeklyPlans(true));
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  if (query.isError && !result) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!result) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Henter ugens madplaner">
        <p className="m-0 text-[15px] text-ink-2">Henter ugens madplaner fra danske madsider…</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => <div key={key} className="skeleton h-80 rounded-[28px]" />)}
        </div>
      </div>
    );
  }

  const section = (plan: WeeklyPlan) => (
    <section key={plan.id} aria-labelledby={`${plan.id}-title`}>
      <div className="mb-3 mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${plan.id}-title`} className="font-display m-0 text-xl font-bold">
          {plan.sourceName}
          <span className="ml-2 text-[15px] font-normal text-ink-2">{plan.title}</span>
        </h2>
        <a href={plan.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-[15px] text-accent">
          Se hele planen
          <ExternalLink size={15} aria-hidden="true" />
        </a>
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {plan.dishes.map(({ day, recipe }) => (
          <li key={`${day}-${recipe.id}`} className="flex flex-col">
            <InspirationCard
              recipe={recipe}
              badge={DAYS[day] ?? ""}
              isNew={!ownSources.has(recipe.sourceUrl)}
              saved={savedIds.has(recipe.id)}
              busy={adding === recipe.id}
              onToggleSave={() => toggleSave(recipe)}
              onAdd={() => add(recipe)}
            />
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[15px] text-ink-2">
          Madplaner som danske madsider har lagt ud for uge {shownWeek ?? result.week}.
          {result.fetchedAt ? ` Hentet ${time(result.fetchedAt)}.` : ""}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="flex h-11 items-center gap-2 rounded-full border border-line px-4 text-[15px] font-semibold text-ink hover:bg-raised disabled:opacity-60"
        >
          <RefreshCw size={17} aria-hidden="true" className={refreshing ? "animate-spin" : undefined} />
          {refreshing ? "Henter…" : "Hent igen"}
        </button>
      </div>
      {__FAKE_API__ ? <p className="m-0 text-sm text-offer">Demotilstand: planerne er eksempler fra den indbyggede samling.</p> : null}

      {weeks.length > 1 ? (
        <div className="flex gap-2" role="group" aria-label="Uge">
          {weeks.map((number) => (
            <button key={number} type="button" aria-pressed={number === shownWeek} className={chip(number === shownWeek)} onClick={() => setWeek(number)}>
              {number === result.week ? `Denne uge (${number})` : `Uge ${number}`}
            </button>
          ))}
        </div>
      ) : null}
      {sources.length > 1 ? (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label="Kilde">
          {["Alle", ...sources].map((name) => (
            <button key={name} type="button" aria-pressed={source === name} className={chip(source === name)} onClick={() => setSource(name)}>
              {name}
            </button>
          ))}
        </div>
      ) : null}

      {plans.length > 0 ? (
        plans.map(section)
      ) : (
        <p className="rounded-3xl bg-surface p-8 text-center text-[15px] text-ink-2">Ingen madplaner fundet for ugen endnu. Prøv igen senere.</p>
      )}

      {result.failures.length > 0 ? (
        <div role="note" className="flex gap-3 rounded-3xl bg-surface p-4 text-sm leading-relaxed text-ink-2">
          <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
          <ul className="m-0 list-none p-0">
            {result.failures.map((failure) => (
              <li key={failure.sourceName}>
                <strong className="font-semibold text-ink">{failure.sourceName}:</strong> {failure.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
