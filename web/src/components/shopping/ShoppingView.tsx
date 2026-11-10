import { useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useShoppingActions } from "@/api/shopping-mutations";
import { useBootstrap, useShopping } from "@/api/queries";
import { useIsWide } from "@/hooks/use-media";
import { useShoppingRange } from "@/hooks/use-shopping-range";
import { useToday } from "@/hooks/use-today";
import { groupByCategory } from "@/lib/shopping-view";
import { ErrorState } from "@/components/ui/StatusViews";
import { AddExtraField } from "./AddExtraField";
import { PantryChips } from "./PantryChips";
import { PriceSummary } from "./PriceSummary";
import { RangeSheet } from "./RangeSheet";
import { ResetSheet } from "./ResetSheet";
import { DoneRow, OpenRow } from "./ShoppingRow";
import { ShoppingHeader } from "./ShoppingHeader";

const heading = "mx-0.5 text-[13px] font-semibold uppercase tracking-[0.05em] text-muted";

/** `#/indkob` – the one current shopping list ("butikstilstand"). */
export function ShoppingView() {
  const today = useToday();
  const wide = useIsWide();
  const { query, setEnd } = useShoppingRange(today);
  const shopping = useShopping(query);
  const bootstrap = useBootstrap();
  const actions = useShoppingActions();
  const [rangeOpen, setRangeOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const list = shopping.data;
  const open = useMemo(() => groupByCategory((list?.items ?? []).filter((item) => !item.checked)), [list]);
  const done = useMemo(() => (list?.items ?? []).filter((item) => item.checked), [list]);

  if (shopping.isError && !list) return <ErrorState error={shopping.error} onRetry={() => void shopping.refetch()} />;
  if (!list) return <div className="skeleton m-4 h-64 rounded-3xl" aria-label="Henter indkøbslisten" />;

  const isEmpty = list.items.length === 0;
  const openGroups = (
    <div className="flex flex-col gap-[18px]">
      {open.map((group) => (
        <section key={group.category} aria-label={group.category} className="flex flex-col gap-1.5">
          <h2 className={heading}>{group.category}</h2>
          <ul className="flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {group.items.map((item) => (
                <OpenRow key={item.id} item={item} onToggle={actions.toggle} onRemove={actions.removeExtra} />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}
      {open.length === 0 && !isEmpty ? (
        <p className="rounded-2xl bg-surface px-4 py-5 text-[15px] text-ink-2">Alt er i kurven. God tur hjem.</p>
      ) : null}
      {isEmpty ? <EmptyState /> : null}
    </div>
  );
  const basket =
    done.length > 0 ? (
      <section aria-label="I kurven" className="flex flex-col gap-1.5">
        <h2 className={heading}>I kurven · {done.length}</h2>
        <ul className="flex flex-col gap-1">
          {done.map((item) => (
            <DoneRow key={item.id} item={item} onToggle={actions.toggle} onRemove={actions.removeExtra} />
          ))}
        </ul>
      </section>
    ) : null;
  const note = (
    <p className="mx-0.5 text-[13px] leading-normal text-muted">
      Salt, peber, olie og det I har i køleskabet er trukket fra
      {list.excludedCount > 0 ? ` (${list.excludedCount} ingredienser)` : ""}.
    </p>
  );
  const newTrip = (
    <button
      type="button"
      onClick={() => setResetOpen(true)}
      className="h-14 rounded-full border border-line text-base font-semibold text-ink"
    >
      Ny indkøbstur
    </button>
  );

  return (
    <div className="mx-auto flex h-full max-w-[1100px] flex-col">
      <ShoppingHeader
        list={list}
        today={today}
        wide={wide}
        onOpenRange={() => setRangeOpen(true)}
        addField={wide ? null : <AddExtraField onAdd={actions.addExtra} />}
      />
      {wide ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-8 overflow-y-auto px-8 pb-8">
          <div className="flex flex-col gap-[18px]">
            {openGroups}
            {note}
          </div>
          <div className="flex flex-col gap-5">
            <PriceSummary list={list} />
            <AddExtraField onAdd={actions.addExtra} />
            {basket}
            <PantryChips pantry={bootstrap.data?.pantry ?? []} onChange={actions.setPantry} />
            {newTrip}
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-4 pb-4">
            {openGroups}
            {basket}
            {note}
            <PantryChips pantry={bootstrap.data?.pantry ?? []} onChange={actions.setPantry} />
            {newTrip}
          </div>
          <PriceSummary list={list} footer />
        </>
      )}
      <RangeSheet
        open={rangeOpen}
        onClose={() => setRangeOpen(false)}
        today={today}
        from={list.from}
        to={list.to}
        onChange={setEnd}
      />
      <ResetSheet
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => {
          setEnd(undefined);
          void actions.reset();
        }}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-3xl bg-surface p-6">
      <strong className="font-display text-xl">Ingen varer endnu</strong>
      <p className="text-[15px] text-ink-2">
        Der er ikke planlagt aftensmad i perioden. Planlæg nogle retter, så fylder listen selv op, eller tilføj varer
        selv.
      </p>
      <a
        href="#/uge"
        className="flex h-12 items-center rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent no-underline"
      >
        Gå til ugen
      </a>
    </div>
  );
}
