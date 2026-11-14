/** Publishes Madplan state as Home Assistant sensor entities through the Supervisor's Core API proxy. */
import { msUntilMidnightInZone } from "../timezone.ts";
import { addDaysToKey, weekdayName } from "@madplan/domain";
import type { ChangeTopic, Dish } from "@madplan/domain";
import type { Deps } from "../deps.ts";
import { currentShoppingList, snapshot } from "../state.ts";

const STATES_URL = "http://supervisor/core/api/states/";
const RELEVANT: readonly ChangeTopic[] = ["meals", "dishes", "shopping", "settings", "household", "offers"];

export type EntityState = { entityId: string; state: string; attributes: Record<string, unknown> };

/** Days shown by sensor.madplan_kommende (and the upcoming-dishes card). */
export const UPCOMING_DAYS = 14;

function pictureOf(deps: Deps, dish: Dish | undefined): string | undefined {
  return dish?.imageKey && deps.config.publicImageBase
    ? `${deps.config.publicImageBase}/images/dishes/${dish.imageKey}.jpg`
    : dish?.imageUrl;
}

export function buildEntities(deps: Deps): EntityState[] {
  const state = snapshot(deps);
  const meal = state.meals[state.today];
  const dish = meal && !meal.skipped ? state.dishes.find((candidate) => candidate.id === meal.dishId) : undefined;
  const picture = pictureOf(deps, dish);
  const nextMeal = state.meals[addDaysToKey(state.today, 1)];
  const tomorrow = nextMeal && !nextMeal.skipped ? state.dishes.find((candidate) => candidate.id === nextMeal.dishId) : undefined;
  const tonight: EntityState = {
    entityId: "sensor.madplan_i_aften",
    state: dish?.name ?? "Ingen ret",
    attributes: {
      friendly_name: "Madplan i aften",
      date: state.today,
      icon: "mdi:silverware-fork-knife",
      ...(dish ? { dish_id: dish.id, prep_minutes: dish.prepMinutes } : {}),
      ...(dish && picture ? { entity_picture: picture } : {}),
      ...(meal?.note ? { note: meal.note } : {}),
      // Spoken answers ("hvad skal vi have i morgen?") read this; see DOCS.md.
      tomorrow: tomorrow?.name ?? "Ingen ret",
    },
  };
  const list = currentShoppingList(deps);
  const shopping: EntityState = {
    entityId: "sensor.madplan_indkob",
    state: String(list.items.filter((item) => !item.checked).length),
    attributes: {
      friendly_name: "Madplan indkøb",
      unit_of_measurement: "varer",
      icon: "mdi:cart-outline",
      estimated_price_dkk: Math.round(list.totalEstimatedPrice),
      // What is still missing, for voice answers and lists on the dashboard (capped to keep the state small).
      items: list.items.filter((item) => !item.checked).slice(0, 60).map((item) => item.label),
      from: list.from,
      to: list.to,
    },
  };
  const days = Array.from({ length: UPCOMING_DAYS }, (_, offset) => {
    const date = addDaysToKey(state.today, offset);
    const planned = state.meals[date];
    const found = planned && !planned.skipped ? state.dishes.find((candidate) => candidate.id === planned.dishId) : undefined;
    const image = pictureOf(deps, found);
    return {
      date,
      weekday: weekdayName(date),
      ...(planned?.skipped ? { skipped: true } : {}),
      ...(found ? { dish_id: found.id, dish: found.name, prep_minutes: found.prepMinutes } : {}),
      ...(found && image ? { picture: image } : {}),
      ...(planned?.note ? { note: planned.note } : {}),
    };
  });
  const upcoming: EntityState = {
    entityId: "sensor.madplan_kommende",
    state: String(days.filter((day) => day.dish_id).length),
    attributes: {
      friendly_name: "Madplan kommende dage",
      unit_of_measurement: "retter",
      icon: "mdi:calendar-month-outline",
      days,
      ...(deps.config.ingressUrl ? { ingress_url: deps.config.ingressUrl } : {}),
    },
  };
  const onOffer = list.items.filter((item) => !item.checked && item.priceIsOffer && item.offer);
  const offers: EntityState = {
    entityId: "sensor.madplan_tilbud",
    state: String(onOffer.length),
    attributes: {
      friendly_name: "Madplan tilbud",
      unit_of_measurement: "varer",
      icon: "mdi:sale-outline",
      // "Hakket oksekød: Netto 29,95 kr." for the voice command and dashboards (capped).
      items: onOffer.slice(0, 30).map((item) => `${item.label}: ${item.offer?.store} ${item.offer?.price ?? ""}`.trim()),
      attribution: "Data fra Prej",
    },
  };
  return [tonight, shopping, upcoming, offers];
}

export type Publisher = {
  /** Publishes now (failures are logged, never thrown). */
  publish(force?: boolean): Promise<void>;
  /** Starts listening for changes and the midnight tick. No-op without a Supervisor token. */
  start(): void;
  stop(): void;
};

export function createPublisher(deps: Deps, debounceMs = 2000): Publisher {
  const token = deps.config.supervisorToken;
  const lastSent = new Map<string, string>();
  let debounce: NodeJS.Timeout | undefined;
  let midnight: NodeJS.Timeout | undefined;
  let unsubscribe: (() => void) | undefined;

  async function publish(force = false): Promise<void> {
    if (!token) return;
    try {
      for (const entity of buildEntities(deps)) {
        const body = JSON.stringify({ state: entity.state, attributes: entity.attributes });
        if (!force && lastSent.get(entity.entityId) === body) continue;
        const response = await deps.fetch(`${STATES_URL}${entity.entityId}`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) lastSent.set(entity.entityId, body);
        else console.error(`Home Assistant afviste ${entity.entityId} (HTTP ${response.status})`);
      }
    } catch (error) {
      console.error("Kunne ikke opdatere Home Assistant-entiteter", error);
    }
  }

  function scheduleMidnight(): void {
    midnight = setTimeout(() => {
      void publish(true);
      scheduleMidnight();
    }, msUntilMidnightInZone(deps.now(), deps.config.timeZone) + 1000);
    midnight.unref();
  }

  return {
    publish,
    start() {
      if (!token) return;
      void publish(true);
      scheduleMidnight();
      unsubscribe = deps.repo.onChange((event) => {
        if (!event.topics.some((topic) => RELEVANT.includes(topic))) return;
        clearTimeout(debounce);
        debounce = setTimeout(() => void publish(), debounceMs);
        debounce.unref();
      });
    },
    stop() {
      clearTimeout(debounce);
      clearTimeout(midnight);
      unsubscribe?.();
    },
  };
}
