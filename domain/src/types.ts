/** Normalized v2 domain model. Dates are local ISO calendar dates (YYYY-MM-DD). */

export type GroceryStore = "netto" | "rema1000";
export type MealSource = "manual" | "local" | "ai";

export type OfferReference = {
  store: "Netto" | "REMA 1000";
  item: string;
  price?: string;
  validFrom?: string;
  validUntil?: string;
  sourceUrl: string;
};

export type Dish = {
  id: string;
  name: string;
  ingredients: string[];
  servings?: number;
  prepMinutes: number;
  category: string;
  favorite: boolean;
  leftoverFriendly: boolean;
  freezerFriendly: boolean;
  /** Basename (without extension) of a bundled image, e.g. "lasagne". */
  imageKey?: string;
  /** External or uploaded image. Used when there is no bundled image. */
  imageUrl?: string;
  sourceUrl?: string;
  instructions?: string[];
  custom?: boolean;
  generated?: boolean;
  /** ISO timestamp. A set value means the dish is soft-deleted (hidden from planning). */
  archivedAt?: string;
};

export type Meal = {
  dishId: string;
  locked: boolean;
  note: string;
  source: MealSource;
  reason?: string;
  offer?: OfferReference;
  /** Day is deliberately left out ("ikke spist"); never counts as eaten. */
  skipped?: boolean;
};

/** Meals keyed by ISO date. */
export type MealMap = Record<string, Meal>;

/** Local family profile; not a Home Assistant login. */
export type Profile = {
  id: string;
  name: string;
  /** False excludes the profile from planning and serving count. */
  active: boolean;
  /** Hard ingredient exclusions (not a certified allergen guarantee). */
  exclusions: string[];
  /** Foods the profile enjoys (soft). */
  preferences: string[];
  /** Foods the profile would rather avoid (soft). */
  dislikes: string[];
  favoriteDishIds: string[];
  portions?: number;
};

export type FridgeItem = {
  name: string;
  /** Free-form amount, for example "3 stk." */
  quantity?: string;
  expiresOn?: string;
  useFirst?: boolean;
};

export type ShoppingExtra = { label: string };

export type ShoppingListState = {
  checked: string[];
  extras: ShoppingExtra[];
};

export type Settings = {
  globalExclusions: string[];
  preferredStores: GroceryStore[];
  preferredServings?: number;
};

export const INSPIRATION_CUISINES = [
  "Thailand",
  "Japan",
  "Indien",
  "Kina",
  "Korea",
  "Vietnam",
  "Italien",
  "Mexico",
  "Mellemøsten",
  "Danmark",
  "International",
] as const;

export type InspirationCuisine = (typeof INSPIRATION_CUISINES)[number];

export type InspirationRecipe = {
  id: string;
  name: string;
  cuisine: InspirationCuisine;
  prepMinutes: number;
  description: string;
  tags: string[];
  sourceName: string;
  sourceUrl: string;
  imageKey?: string;
  imageUrl?: string;
};

type DraftDayBase = {
  date: string;
  reason: string;
  locked: boolean;
  source: MealSource;
  offer?: OfferReference;
};

/** Either an existing dish (dishId) or a brand-new one proposed by the planner (newDish). */
export type DraftDay =
  | (DraftDayBase & { dishId: string; newDish?: undefined })
  | (DraftDayBase & { dishId?: undefined; newDish: Dish });

export type PlanDraft = {
  days: DraftDay[];
  message?: string;
};

export type RetailOffer = {
  name: string;
  chain: GroceryStore;
  amountOre: number;
  quantityLabel: string;
  validFrom: string | null;
  validUntil: string;
  observed: string;
  source: "Prej";
  sourceUrl: string;
  confirmed: true;
  matchMethod: "all-query-tokens";
};

export type RetailOfferResult = {
  offers: { ingredient: string; matches: RetailOffer[] }[];
  asOf: string;
  exhausted: boolean;
  remainingRequests: number;
  configured: boolean;
};

/** Everything the v2 model persists, as produced by the v1 migration. */
export type MadplanData = {
  meals: MealMap;
  dishes: Dish[];
  profiles: Profile[];
  fridge: FridgeItem[];
  pantry: string[];
  settings: Settings;
  /** Keyed by list id. */
  shoppingLists: Record<string, ShoppingListState>;
  savedInspirations: InspirationRecipe[];
};

// ---------------------------------------------------------------------------
// Exact v1 types, kept for migration only.
// ---------------------------------------------------------------------------

export type MealStatusV1 = "planned" | "eaten" | "skipped";

export type DishV1 = {
  id: string;
  name: string;
  ingredients: string[];
  servings?: number;
  prepMinutes: number;
  category: string;
  favorite: boolean;
  leftoverFriendly: boolean;
  freezerFriendly: boolean;
  imageUrl?: string;
  sourceUrl?: string;
  instructions?: string[];
  custom?: boolean;
  generated?: boolean;
};

export type MealAssignmentV1 = {
  dishId: string;
  status: MealStatusV1;
  note: string;
  locked: boolean;
  reason?: string;
  source?: MealSource;
  offer?: OfferReference;
};

export type MealHistoryEntryV1 = {
  date: string;
  dishId: string;
  status: Exclude<MealStatusV1, "planned">;
};

export type UserProfileV1 = {
  id: string;
  name: string;
  active?: boolean;
  exclusions?: string[];
  preferences?: string[];
  dislikes?: string[];
  favoriteDishIds?: string[];
  portions?: number;
};

export type ShoppingListWeekV1 = {
  checkedItems: string[];
  extraItems: string[];
};

export type FridgeItemDetailsV1 = {
  quantity?: string;
  expiresOn?: string;
  useFirst?: boolean;
};

export type PlannerPresetIdV1 = "quick" | "budget" | "family" | "fridge";

export type WeekPlanningSettingsV1 = {
  dayCount: number;
  newDishCount: number;
  skippedDates: string[];
  request: string;
  budgetDkk?: number;
  maxPrepMinutes?: number;
  dayRequests?: Record<string, string>;
  presetId?: PlannerPresetIdV1;
};

export type MealPlanStateV1 = {
  version: 1;
  meals: Record<string, MealAssignmentV1>;
  fridge: string[];
  fridgeDetails?: Record<string, FridgeItemDetailsV1>;
  globalExclusions: string;
  household: UserProfileV1[];
  customDishes: DishV1[];
  savedInspirationIds: string[];
  savedInspirationRecipes: InspirationRecipeV1[];
  hiddenDishIds: string[];
  includedDishesByWeek: Record<string, string[]>;
  preferredStores: GroceryStore[];
  preferredServings?: number;
  pantryStaples: string[];
  shoppingListsByWeek: Record<string, ShoppingListWeekV1>;
  planningSettingsByWeek: Record<string, WeekPlanningSettingsV1>;
  undoMealPlan?: {
    meals: Record<string, MealAssignmentV1>;
    history: MealHistoryEntryV1[];
  };
  history: MealHistoryEntryV1[];
};

export type InspirationRecipeV1 = {
  id: string;
  name: string;
  cuisine: InspirationCuisine;
  prepMinutes: number;
  description: string;
  tags: string[];
  sourceName: string;
  sourceUrl: string;
  imageUrl: string;
};
