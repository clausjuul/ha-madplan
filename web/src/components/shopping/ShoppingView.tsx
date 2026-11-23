import { Link } from "react-router";
import { useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";
import { watchlistHits, type ShoppingListItem, type WatchItem } from "@madplan/domain";
import { useShoppingActions } from "@/api/shopping-mutations";
import { useBootstrap, useOffers, useShopping } from "@/api/queries";
import { useHouseholdActions } from "@/api/library-mutations";
import { useIsWide } from "@/hooks/use-media";
import { useShoppingRange } from "@/hooks/use-shopping-range";
import { useToday } from "@/hooks/use-today";
import { useKeepAwake } from "@/hooks/use-wake-lock";
import { notify } from "@/lib/notify";
import type { ShoppingTab } from "@/lib/route";
import { groupByCategory } from "@/lib/shopping-view";
import { ErrorState } from "@/components/ui/StatusViews";
import { AddExtraField } from "./AddExtraField";
import { PantryChips } from "./PantryChips";
import { PriceSummary } from "./PriceSummary";
import { OffersPanel } from "./OffersPanel";
import { RangeSheet } from "./RangeSheet";
import { ResetSheet } from "./ResetSheet";
import { ShoppingMenuSheet } from "./ShoppingMenuSheet";
import { DoneRow, OpenRow } from "./ShoppingRow";
import { ShoppingHeader } from "./ShoppingHeader";

const heading = "mx-0.5 text-[13px] font-semibold uppercase tracking-[0.05em] text-muted";

/** `#/indkob` – the one current shopping list ("butikstilstand"); `#/indkob/tilbud` – the offers tab. */
/** Ticks closer together than this share one toast. */
const BURST_MS = 4000;
const capitalize = (value: string): string => value.charAt(0).toLocaleUpperCase("da-DK") + value.slice(1);

export function ShoppingView({ tab }: { tab?: ShoppingTab }) {
  const today = useToday();
  const wide = useIsWide();
  const { query, setEnd } = useShoppingRange(today);
  const shopping = useShopping(query);
  const bootstrap = useBootstrap();
  const actions = useShoppingActions();
  const [rangeOpen, setRangeOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [basketOpen, setBasketOpen] = useState<boolean | null>(null);
  const checkBurst = useRef<{ at: number; ids: string[] }>({ at: 0, ids: [] });
  const keepAwake = useKeepAwake();
  const offersOn = bootstrap.data?.capabilities.offers === true;
  const household = useHouseholdActions();
  const settings = bootstrap.data?.settings;
  const watchlist = settings?.offerWatchlist ?? [];
  // The stored offers are only loaded on the list tab when something is watched (for the count on the tab).
  const offers = useOffers(offersOn && watchlist.length > 0);
  const watchedOnOffer = useMemo(
    () =>
      offers.data && settings
        ? watchlistHits(watchlist, offers.data.offers, settings.preferredStores, today).filter((hit) => hit.offers.length > 0).length
        : 0,
    [offers.data, settings, watchlist, today],
  );

  const list = shopping.data;
  const open = useMemo(() => groupByCategory((list?.items ?? []).filter((item) => !item.checked)), [list]);
  const done = useMemo(() => (list?.items ?? []).filter((item) => item.checked), [list]);

  if (shopping.isError && !list) return <ErrorState error={shopping.error} onRetry={() => void shopping.refetch()} />;
  if (!list) return <div className="skeleton m-4 h-64 rounded-3xl" aria-label="Henter indkøbslisten" />;

  const showOffers = offersOn && tab === "tilbud";
  const isEmpty = list.items.length === 0;
  // The basket is folded away on phones (the list is what matters in the shop) and open on tablets.
  const showBasket = basketOpen ?? wide;

  const toggle = (item: ShoppingListItem): void => {
    actions.toggle(item.id);
    if (item.checked) return;
    try {
      navigator.vibrate?.(12);
    } catch {
      // No vibration on this device.
    }
    // Ticking off fast in the shop: one toast counts the burst, and Fortryd takes back the latest one.
    const now = Date.now();
    const burst = now - checkBurst.current.at < BURST_MS ? [...checkBurst.current.ids, item.id] : [item.id];
    checkBurst.current = { at: now, ids: burst };
    const undoLatest = {
      label: "Fortryd",
      run: () => {
        actions.toggle(item.id);
        checkBurst.current = { at: 0, ids: [] };
      },
    };
    const message = burst.length === 1 ? `«${capitalize(item.label)}» er i kurven.` : `${burst.length} varer i kurven · senest ${item.label}.`;
    notify(message, BURST_MS, undoLatest);
  };
  const removeExtra = (itemId: string): void => {
    const item = list.items.find((candidate) => candidate.id === itemId);
    actions.removeExtra(itemId);
    if (item) notify(`«${capitalize(item.label)}» er fjernet fra listen.`, 5000, { label: "Fortryd", run: () => actions.addExtra(item.sourceLabel) });
  };
  const toggleAwake = (): void => {
    const next = !keepAwake.wanted;
    keepAwake.setWanted(next);
    notify(next ? "Skærmen holdes tændt, mens indkøbslisten er åben." : "Skærmen slukker igen som normalt.");
  };
  const saveWatchlist = (next: WatchItem[]): void => {
    if (settings) void household.saveSettings({ ...settings, offerWatchlist: next });
  };
  const newTripButton = (
    <button
      type="button"
      onClick={() => setResetOpen(true)}
      className="h-14 rounded-full border border-line text-base font-semibold text-ink"
    >
      Ny indkøbstur
    </button>
  );

  const openGroups = (
    <div className="flex flex-col gap-[18px]">
      {open.map((group) => (
        <section key={group.category} aria-label={group.category} className="flex flex-col gap-1.5">
          <h2 className={`${heading} ${wide ? "" : "sticky top-0 z-10 -mx-4 bg-ground/95 px-[18px] py-1.5 backdrop-blur"}`}>
            {group.category} <span className="font-normal normal-case tracking-normal">· {group.items.length}</span>
          </h2>
          <ul className="flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {group.items.map((item) => (
                <OpenRow key={item.id} item={item} onToggle={() => toggle(item)} onRemove={removeExtra} />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}
      {open.length === 0 && !isEmpty ? (
        <div className="flex flex-col gap-3 rounded-3xl bg-surface p-5">
          <p className="m-0 text-[17px] font-semibold text-ink">Alt er i kurven. God tur hjem.</p>
          {wide ? null : newTripButton}
        </div>
      ) : null}
      {isEmpty ? <EmptyState /> : null}
    </div>
  );
  const basket =
    done.length > 0 ? (
      <section aria-label="I kurven" className="flex flex-col gap-1.5">
        <h2 className="m-0">
          <button
            type="button"
            aria-expanded={showBasket}
            onClick={() => setBasketOpen(!showBasket)}
            className={`${heading} flex min-h-11 w-full items-center gap-1.5 bg-transparent text-left`}
          >
            I kurven · {done.length}
            <span className="flex-1" />
            <span className="font-medium normal-case tracking-normal text-ink-2">{showBasket ? "Skjul" : "Vis"}</span>
            <ChevronDown size={16} aria-hidden="true" className={`text-ink-2 transition-transform ${showBasket ? "rotate-180" : ""}`} />
          </button>
        </h2>
        {showBasket ? (
          <ul className="flex flex-col gap-1">
            {done.map((item) => (
              <DoneRow key={item.id} item={item} onToggle={() => toggle(item)} onRemove={removeExtra} />
            ))}
          </ul>
        ) : null}
      </section>
    ) : null;
  const note = (
    <p className="mx-0.5 text-[13px] leading-normal text-muted">
      Salt, peber, olie og det I har i køleskabet er trukket fra
      {list.excludedCount > 0 ? ` (${list.excludedCount} ingredienser)` : ""}.{!wide && list.basket ? " Tilbud: data fra Prej." : ""}
    </p>
  );

  return (
    <div className="mx-auto flex h-full max-w-[1100px] flex-col">
      <ShoppingHeader
        list={list}
        today={today}
        wide={wide}
        onOpenRange={() => setRangeOpen(true)}
        tab={showOffers ? "tilbud" : undefined}
        offersOn={offersOn}
        watchedOnOffer={watchedOnOffer}
        keepAwake={keepAwake}
        onToggleAwake={toggleAwake}
        {...(wide ? {} : { onOpenMenu: () => setMenuOpen(true) })}
      />
      {showOffers ? (
        <div className={`min-h-0 flex-1 overflow-y-auto ${wide ? "px-8 pb-8" : "px-4 pb-4 pt-3"}`}>
          <div className="max-w-[720px]">
            <OffersPanel
              list={list}
              stores={settings?.preferredStores ?? []}
              dishes={bootstrap.data?.dishes ?? []}
              today={today}
              onAdd={actions.addExtra}
              watchlist={watchlist}
              onWatchChange={saveWatchlist}
            />
          </div>
        </div>
      ) : wide ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-8 overflow-y-auto px-8 pb-8 pt-4">
          <div className="flex flex-col gap-[18px]">
            {openGroups}
            {note}
          </div>
          <div className="flex flex-col gap-5">
            <PriceSummary list={list} />
            <AddExtraField onAdd={actions.addExtra} />
            {basket}
            <PantryChips pantry={bootstrap.data?.pantry ?? []} onChange={actions.setPantry} />
            {newTripButton}
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-4 pb-6 pt-3">
            <AddExtraField onAdd={actions.addExtra} />
            {openGroups}
            {basket}
            {note}
          </div>
          <PriceSummary list={list} footer />
        </>
      )}
      {wide ? null : (
        <ShoppingMenuSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          pantry={bootstrap.data?.pantry ?? []}
          onPantryChange={actions.setPantry}
          onNewTrip={() => setResetOpen(true)}
          canKeepAwake={keepAwake.supported}
        />
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
          setBasketOpen(null);
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
      <Link
        to="/planlaeg"
        className="flex h-12 items-center rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent no-underline"
      >
        Planlæg ugen
      </Link>
    </div>
  );
}
