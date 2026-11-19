/**
 * Item-level edits of the current shopping list, shared by the voice commands and the internal API
 * that the Home Assistant integration uses. Items from the meal plan come from recipes: they can be
 * ticked off but never renamed or really deleted; own extras can be changed freely.
 */
import { extraItemId, normalizeItem } from "@madplan/domain";
import type { ShoppingListItem, ShoppingListState } from "@madplan/domain";
import type { Deps } from "../deps.ts";
import { notFound, unprocessable } from "../errors.ts";
import { currentShoppingList } from "../state.ts";
import { getShoppingState, setShoppingState } from "../store-household.ts";

export type AddOutcome = "added" | "already";
export type RemoveOutcome = "removed" | "ticked" | "missing";

function edit<T>(deps: Deps, work: (state: ShoppingListState, items: ShoppingListItem[]) => { state: ShoppingListState; result: T }): T {
  return deps.repo.mutate(["shopping"], () => {
    const items = currentShoppingList(deps).items;
    const { state, result } = work(getShoppingState(deps.repo.db), items);
    setShoppingState(deps.repo.db, state);
    return result;
  });
}

const byLabel = (items: readonly ShoppingListItem[], label: string) => {
  const key = normalizeItem(label);
  return items.find((item) => normalizeItem(item.label) === key);
};

const byId = (items: readonly ShoppingListItem[], id: string): ShoppingListItem => {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw notFound("Varen findes ikke på indkøbslisten.");
  return item;
};

/** Adds an extra; an item that is already there is left alone, a ticked one gets its tick removed. */
export function addItems(deps: Deps, labels: readonly string[]): AddOutcome[] {
  return edit(deps, (state, items) => {
    const extras = [...state.extras];
    let checked = [...state.checked];
    const result = labels.map((raw): AddOutcome => {
      const label = raw.replace(/\s+/gu, " ").trim().slice(0, 100);
      const existing = byLabel(items, label);
      if (existing && !existing.checked) return "already";
      if (existing) {
        checked = checked.filter((id) => id !== existing.id);
        return "added";
      }
      if (extras.some((extra) => extraItemId(extra.label) === extraItemId(label))) {
        checked = checked.filter((id) => id !== extraItemId(label));
        return "added";
      }
      extras.push({ label });
      return "added";
    });
    return { state: { checked, extras }, result };
  });
}

/** Removes by spoken name: own extras are deleted, items from the meal plan are ticked off. */
export function removeItemsByLabel(deps: Deps, labels: readonly string[]): { outcome: RemoveOutcome; label: string }[] {
  return edit(deps, (state, items) => {
    let extras = [...state.extras];
    let checked = [...state.checked];
    const result = labels.map((label) => {
      const existing = byLabel(items, label);
      if (!existing || existing.checked) return { outcome: "missing" as const, label };
      if (existing.extra) {
        extras = extras.filter((extra) => extraItemId(extra.label) !== existing.id);
        checked = checked.filter((id) => id !== existing.id);
        return { outcome: "removed" as const, label: existing.label };
      }
      checked.push(existing.id);
      return { outcome: "ticked" as const, label: existing.label };
    });
    return { state: { checked, extras }, result };
  });
}

export function setItemChecked(deps: Deps, id: string, value: boolean): void {
  edit(deps, (state, items) => {
    const item = byId(items, id);
    const others = state.checked.filter((candidate) => candidate !== item.id);
    return { state: { ...state, checked: value ? [...others, item.id] : others }, result: undefined };
  });
}

/** Renames an own extra (keeping its tick) and returns its new id. Meal-plan items are renamed in the recipe. */
export function renameItem(deps: Deps, id: string, rawLabel: string): string {
  const label = rawLabel.replace(/\s+/gu, " ").trim().slice(0, 100);
  if (!label) throw unprocessable("Varen skal have et navn.");
  return edit(deps, (state, items) => {
    const item = byId(items, id);
    if (!item.extra) throw unprocessable("Varer fra madplanen kan ikke omdøbes. Ret opskriften i Madplan.");
    if (normalizeItem(label) === normalizeItem(item.label)) {
      return { state: { ...state, extras: state.extras.map((extra) => (extraItemId(extra.label) === id ? { label } : extra)) }, result: id };
    }
    if (byLabel(items, label)) throw unprocessable(`${label} står allerede på indkøbslisten.`);
    const wasChecked = state.checked.includes(id);
    const checked = state.checked.filter((candidate) => candidate !== id);
    return {
      state: {
        checked: wasChecked ? [...checked, extraItemId(label)] : checked,
        extras: state.extras.map((extra) => (extraItemId(extra.label) === id ? { label } : extra)),
      },
      result: extraItemId(label),
    };
  });
}

/** Deletes an own extra; an item from the meal plan is ticked off instead (it comes from a recipe). */
export function deleteItem(deps: Deps, id: string): "removed" | "ticked" {
  return edit(deps, (state, items) => {
    const item = byId(items, id);
    if (item.extra) {
      return {
        state: { checked: state.checked.filter((candidate) => candidate !== id), extras: state.extras.filter((extra) => extraItemId(extra.label) !== id) },
        result: "removed" as const,
      };
    }
    return { state: { ...state, checked: state.checked.includes(id) ? state.checked : [...state.checked, id] }, result: "ticked" as const };
  });
}
