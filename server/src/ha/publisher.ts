/** Publishes Madplan state as Home Assistant sensor entities through the Supervisor's Core API proxy. */
import { msUntilMidnightInZone } from "../timezone.ts";
import type { ChangeTopic } from "@madplan/domain";
import type { Deps } from "../deps.ts";
import { currentShoppingList, snapshot } from "../state.ts";

const STATES_URL = "http://supervisor/core/api/states/";
const RELEVANT: readonly ChangeTopic[] = ["meals", "dishes", "shopping", "settings", "household"];

export type EntityState = { entityId: string; state: string; attributes: Record<string, unknown> };

export function buildEntities(deps: Deps): EntityState[] {
  const state = snapshot(deps);
  const meal = state.meals[state.today];
  const dish = meal && !meal.skipped ? state.dishes.find((candidate) => candidate.id === meal.dishId) : undefined;
  const picture =
    dish?.imageKey && deps.config.publicImageBase
      ? `${deps.config.publicImageBase}/images/dishes/${dish.imageKey}.jpg`
      : dish?.imageUrl;
  const tonight: EntityState = {
    entityId: "sensor.madplan_i_aften",
    state: dish?.name ?? "Ingen ret",
    attributes: {
      friendly_name: "Madplan i aften",
      date: state.today,
      icon: "mdi:silverware-fork-knife",
      ...(dish ? { dish_id: dish.id, prep_minutes: dish.prepMinutes } : {}),
      ...(dish && picture ? { entity_picture: picture } : {}),
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
      from: list.from,
      to: list.to,
    },
  };
  return [tonight, shopping];
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
