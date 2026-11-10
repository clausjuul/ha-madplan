import type { Dish, Meal, Profile } from "../src/index.ts";

export function dish(overrides: Partial<Dish> & Pick<Dish, "id" | "name">): Dish {
  return {
    ingredients: [],
    prepMinutes: 30,
    category: "Andet",
    favorite: false,
    leftoverFriendly: false,
    freezerFriendly: false,
    ...overrides,
  };
}

export function meal(dishId: string, overrides: Partial<Meal> = {}): Meal {
  return { dishId, locked: false, note: "", source: "manual", ...overrides };
}

export function profile(overrides: Partial<Profile> & Pick<Profile, "id" | "name">): Profile {
  return {
    active: true,
    exclusions: [],
    preferences: [],
    dislikes: [],
    favoriteDishIds: [],
    ...overrides,
  };
}
