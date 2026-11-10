import type { Hono } from "hono";
import { extraItemId } from "@madplan/domain";
import type { ShoppingListState } from "@madplan/domain";
import type { Deps } from "../deps.ts";
import { notFound } from "../errors.ts";
import { readJson } from "../http.ts";
import { currentShoppingList } from "../state.ts";
import { getShoppingState, setShoppingState } from "../store-household.ts";
import { dateParam } from "../validate.ts";
import { rec, str } from "../validate-basic.ts";

export function shoppingRoutes(api: Hono, deps: Deps): void {
  const { repo } = deps;

  const update = (change: (state: ShoppingListState) => ShoppingListState) => {
    repo.mutate(["shopping"], () => setShoppingState(repo.db, change(getShoppingState(repo.db))));
    return currentShoppingList(deps);
  };

  api.get("/shopping", (c) => {
    const from = c.req.query("from");
    const to = c.req.query("to");
    return c.json(
      currentShoppingList(deps, {
        from: from === undefined ? undefined : dateParam(from),
        to: to === undefined ? undefined : dateParam(to),
      }),
    );
  });

  api.post("/shopping/toggle", async (c) => {
    const body = rec(await readJson(c), "Afkrydsning");
    const itemId = str(body.itemId, "Vare", { min: 1, max: 300 });
    return c.json(
      update((state) => ({
        ...state,
        checked: state.checked.includes(itemId)
          ? state.checked.filter((id) => id !== itemId)
          : [...state.checked, itemId],
      })),
    );
  });

  api.post("/shopping/extras", async (c) => {
    const body = rec(await readJson(c), "Ekstra vare");
    const label = str(body.label, "Varenavn", { min: 1, max: 100 });
    return c.json(
      update((state) =>
        state.extras.some((extra) => extraItemId(extra.label) === extraItemId(label))
          ? state
          : { ...state, extras: [...state.extras, { label }] },
      ),
    );
  });

  api.delete("/shopping/extras/:itemId", (c) => {
    const itemId = c.req.param("itemId");
    const state = getShoppingState(repo.db);
    if (!state.extras.some((extra) => extraItemId(extra.label) === itemId)) {
      throw notFound("Varen findes ikke på listen.");
    }
    return c.json(
      update((current) => ({
        checked: current.checked.filter((id) => id !== itemId),
        extras: current.extras.filter((extra) => extraItemId(extra.label) !== itemId),
      })),
    );
  });

  api.post("/shopping/reset", (c) => c.json(update(() => ({ checked: [], extras: [] }))));
}
