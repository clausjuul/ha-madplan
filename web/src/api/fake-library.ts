import {
  migrateV1,
  type ChangeTopic,
  type Dish,
  type InspirationRecipe,
} from "@madplan/domain";
import { ApiRequestError, type ApiClient } from "./client";
import type { FakeState } from "./fake-data";

type LibraryMethods = Pick<
  ApiClient,
  | "createDish"
  | "updateDish"
  | "archiveDish"
  | "restoreDish"
  | "importDishFromUrl"
  | "discover"
  | "importInspiration"
  | "saveInspirations"
  | "importV1"
  | "exportData"
>;

type Context = {
  state: FakeState;
  wait: () => Promise<void>;
  emit: (topics: ChangeTopic[]) => void;
  /** Called after a successful v1 import, so `isEmpty` turns false. */
  onImported: () => void;
};

/** Clearly labelled demo results; the real server only answers when OpenAI is configured. */
const DEMO_DISCOVERY: InspirationRecipe[] = [
  {
    id: "demo-pad-kra-pao",
    name: "Demo: Pad kra pao med spejlæg",
    cuisine: "Thailand",
    prepMinutes: 25,
    description: "Demoresultat. Stærk thailandsk wok med hakket svinekød, basilikum og spejlæg.",
    tags: ["Demo", "Hurtig"],
    sourceName: "Demo",
    sourceUrl: "https://example.com/pad-kra-pao",
  },
  {
    id: "demo-shakshuka",
    name: "Demo: Shakshuka med feta",
    cuisine: "Mellemøsten",
    prepMinutes: 30,
    description: "Demoresultat. Æg pocheret i krydret tomatsovs, serveres med brød.",
    tags: ["Demo", "Vegetar"],
    sourceName: "Demo",
    sourceUrl: "https://example.com/shakshuka",
  },
  {
    id: "demo-bibimbap",
    name: "Demo: Bibimbap",
    cuisine: "Korea",
    prepMinutes: 40,
    description: "Demoresultat. Ris med grøntsager, oksekød og gochujang.",
    tags: ["Demo"],
    sourceName: "Demo",
    sourceUrl: "https://example.com/bibimbap",
  },
];

const DEMO_IMPORT: Omit<Dish, "id"> = {
  name: "Linsesuppe med citron",
  category: "Suppe",
  prepMinutes: 35,
  servings: 4,
  ingredients: ["250 g røde linser", "1 løg", "2 gulerødder", "1 l bouillon", "1 citron"],
  instructions: ["Svits løg og gulerod.", "Tilsæt linser og bouillon, og kog i 20 minutter.", "Blend og smag til med citron."],
  favorite: false,
  leftoverFriendly: true,
  freezerFriendly: true,
  sourceUrl: "https://example.com/linsesuppe",
  custom: true,
};

let counter = 0;
const newId = (): string => `custom-fake-${(counter += 1)}`;

export function createFakeLibrary({ state, wait, emit, onImported }: Context): LibraryMethods {
  const find = (id: string): Dish => {
    const dish = state.dishes.find((candidate) => candidate.id === id);
    if (!dish) throw new ApiRequestError(404, "not_found", "Retten findes ikke.");
    return dish;
  };
  const replace = (dish: Dish): Dish => {
    const index = state.dishes.findIndex((candidate) => candidate.id === dish.id);
    if (index >= 0) state.dishes[index] = dish;
    else state.dishes.push(dish);
    emit(["dishes", "shopping"]);
    return structuredClone(dish);
  };

  return {
    async createDish(input) {
      await wait();
      return replace({ ...input, id: newId(), custom: true });
    },
    async updateDish(id, input) {
      await wait();
      const existing = find(id);
      return replace({
        ...input,
        id,
        ...(existing.custom ? { custom: true } : {}),
        ...(existing.archivedAt ? { archivedAt: existing.archivedAt } : {}),
      });
    },
    async archiveDish(id) {
      await wait();
      const existing = find(id);
      return replace({ ...existing, archivedAt: existing.archivedAt ?? new Date().toISOString() });
    },
    async restoreDish(id) {
      await wait();
      const { archivedAt: _removed, ...rest } = find(id);
      return replace(rest);
    },
    async importDishFromUrl({ url }) {
      await wait();
      let host = "";
      try {
        host = new URL(url).hostname;
      } catch {
        throw new ApiRequestError(400, "bad_request", "Det ligner ikke et gyldigt link.");
      }
      if (!host.includes("example")) {
        throw new ApiRequestError(
          422,
          "no_recipe",
          "Jeg kunne ikke finde en opskrift på den side. Prøv en side med struktureret opskriftsdata, eller opret retten selv.",
        );
      }
      return replace({ ...DEMO_IMPORT, id: newId(), sourceUrl: url });
    },

    async discover(input) {
      await wait();
      const matches = DEMO_DISCOVERY.filter(
        (recipe) => input.cuisine === "Alle" || recipe.cuisine === input.cuisine,
      );
      return { recipes: structuredClone(matches.length > 0 ? matches : DEMO_DISCOVERY) };
    },
    async importInspiration(recipe) {
      await wait();
      return replace({
        id: newId(),
        name: recipe.name.replace(/^Demo: /u, ""),
        category: recipe.cuisine,
        prepMinutes: recipe.prepMinutes,
        ingredients: ["Se opskriften via linket"],
        favorite: false,
        leftoverFriendly: false,
        freezerFriendly: false,
        sourceUrl: recipe.sourceUrl,
        custom: true,
        ...(recipe.imageKey ? { imageKey: recipe.imageKey } : {}),
      });
    },
    async saveInspirations(recipes) {
      await wait();
      state.savedInspirations = structuredClone(recipes);
      emit(["inspirations"]);
      return structuredClone(recipes);
    },

    async importV1(body) {
      await wait();
      const result = migrateV1(body, { now: new Date().toISOString() });
      if (!result.ok) throw new ApiRequestError(400, "bad_request", result.error);
      const { data } = result;
      state.meals = data.meals;
      state.dishes = data.dishes.length > 0 ? mergeDishes(state.dishes, data.dishes) : state.dishes;
      state.profiles = data.profiles;
      state.fridge = data.fridge;
      state.pantry = data.pantry;
      state.settings = data.settings;
      state.savedInspirations = data.savedInspirations;
      onImported();
      emit(["meals", "dishes", "household", "settings", "inspirations", "shopping"]);
      return {
        warnings: result.warnings,
        counts: {
          meals: Object.keys(data.meals).length,
          dishes: data.dishes.length,
          profiles: data.profiles.length,
        },
      };
    },
    async exportData() {
      await wait();
      const { meals, dishes, profiles, fridge, pantry, settings, savedInspirations } = structuredClone(state);
      return {
        format: "madplan-export",
        version: 2,
        exportedAt: new Date().toISOString(),
        data: { meals, dishes, profiles, fridge, pantry, settings, savedInspirations },
      };
    },
  };
}

function mergeDishes(current: Dish[], incoming: Dish[]): Dish[] {
  const byId = new Map(current.map((dish) => [dish.id, dish]));
  for (const dish of incoming) byId.set(dish.id, dish);
  return [...byId.values()];
}
