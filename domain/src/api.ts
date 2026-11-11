/**
 * HTTP API contract between server/ and web/ (v2).
 *
 * All paths are RELATIVE to the app's base URL (Home Assistant Ingress serves the app under
 * /api/hassio_ingress/<token>/), so the client must resolve them against document.baseURI.
 * JSON in, JSON out. Errors: non-2xx with body ApiError.
 */
import type { PlanReview } from "./plan-review.ts";
import type { ShoppingList } from "./shopping.ts";
import type {
  Dish,
  DraftDay,
  FridgeItem,
  InspirationCuisine,
  InspirationRecipe,
  Meal,
  MealMap,
  MealRating,
  MealSource,
  OfferReference,
  Profile,
  Settings,
} from "./types.ts";

export type ApiError = {
  error: string;
  /** Danish, safe to show to the user. */
  message: string;
};

// GET api/health
export type HealthResponse = { ok: true; version: string };

/** Which optional integrations are usable right now. */
export type Capabilities = {
  /** OpenAI key configured (week planning with web search, discovery, Assist). */
  openai: boolean;
  /** Home Assistant conversation agent reachable via the Supervisor. */
  homeAssistantAgent: boolean;
  /** Prej key configured (retail offers). */
  offers: boolean;
};

// GET api/bootstrap — everything the UI needs; family-scale data, so no paging.
export type BootstrapResponse = {
  revision: number;
  meals: MealMap;
  /** Built-in catalog dishes merged with custom/overridden ones, archived included (filter on archivedAt). */
  dishes: Dish[];
  profiles: Profile[];
  fridge: FridgeItem[];
  pantry: string[];
  settings: Settings;
  savedInspirations: InspirationRecipe[];
  capabilities: Capabilities;
  /** True when the database is empty and a v1 import is offered. */
  isEmpty: boolean;
};

// Meals ---------------------------------------------------------------------
// PUT    api/meals/:date        body MealInput        -> Meal
// PATCH  api/meals/:date        body Partial<MealInput> -> Meal   (404 if none)
// DELETE api/meals/:date                              -> 204     (409 if locked)
// POST   api/meals/swap         body SwapMealsInput   -> MealMap (both dates; 409 if either is locked)
// POST   api/meals/:date/suggest body SuggestDayInput -> Meal    (local engine, source "local"; 409 if locked)
export type MealInput = {
  dishId: string;
  locked?: boolean;
  note?: string;
  source?: MealSource;
  reason?: string;
  offer?: OfferReference;
  skipped?: boolean;
  /** null clears the rating (PATCH). */
  rating?: MealRating | null;
};
export type SwapMealsInput = { a: string; b: string };
export type SuggestDayInput = { seed: number };

// Dishes --------------------------------------------------------------------
// POST api/dishes                 body DishInput -> Dish (new custom dish; server assigns id)
// PUT  api/dishes/:id             body DishInput -> Dish (editing a built-in stores an override with the same id)
// POST api/dishes/:id/archive                    -> Dish (sets archivedAt; meals and history are kept)
// POST api/dishes/:id/restore                    -> Dish
// POST api/dishes/import-url      body ImportUrlInput -> Dish (structured Recipe data from the page; 422 if none)
export type DishInput = Omit<Dish, "id" | "archivedAt" | "custom">;
export type ImportUrlInput = { url: string };

// Shopping — ONE current list ("the next shopping trip") ----------------------
// GET    api/shopping?from=&to=  -> ShoppingList   (defaults: from = today, to = last planned day >= today, max 14 days)
// POST   api/shopping/toggle     body { itemId }   -> ShoppingList
// POST   api/shopping/extras     body { label }    -> ShoppingList
// DELETE api/shopping/extras/:itemId               -> ShoppingList
// POST   api/shopping/reset                        -> ShoppingList (new trip: clears checks and extras)
export type ToggleShoppingInput = { itemId: string };
export type AddShoppingExtraInput = { label: string };

// Household collections (small; replaced as a whole) ---------------------------
// PUT api/fridge    body FridgeItem[] -> FridgeItem[]
// PUT api/pantry    body string[]     -> string[]
// PUT api/profiles  body Profile[]    -> Profile[]
// PUT api/settings  body Settings     -> Settings

// Plan drafts — persisted server-side until applied or discarded ----------------
// GET    api/plan-drafts/current                    -> PlanDraftRecord | null
// POST   api/plan-drafts           body PlanRequest -> PlanDraftRecord (status "generating" for ai, "ready" for local)
// PATCH  api/plan-drafts/:id/days/:date body DraftDayPatch -> PlanDraftRecord
// POST   api/plan-drafts/:id/regenerate body { dates?: string[] } -> PlanDraftRecord (unlocked days only)
// POST   api/plan-drafts/:id/apply                  -> { meals: MealMap; addedDishes: Dish[] }
// DELETE api/plan-drafts/:id                        -> 204
export type PlanEngine = "ai" | "local";
export type PlanRequest = {
  engine: PlanEngine;
  /** First day considered (clamped to today). */
  from: string;
  dayCount: number;
  skippedDates: string[];
  newDishCount: number;
  requiredDishIds: string[];
  /** Free-text wish for the whole plan. */
  request: string;
  /** Free-text wish per date. */
  dayRequests: Record<string, string>;
  maxPrepMinutes?: number;
  budgetDkk?: number;
  /** One-off fridge contents for this plan; not persisted to the fridge. */
  fridgeOverride?: string[];
  seed?: number;
};
export type PlanDraftStatus = "generating" | "ready" | "failed";
export type PlanDraftRecord = {
  id: string;
  createdAt: string;
  status: PlanDraftStatus;
  /** Which engine actually produced the days, so the UI can label it honestly. */
  engine: PlanEngine;
  request: PlanRequest;
  days: DraftDay[];
  review: PlanReview | null;
  /** Danish, when status is "failed". */
  error?: string;
};
export type DraftDayPatch = { locked?: boolean; dishId?: string };

// Discovery -------------------------------------------------------------------
// POST api/discover             body DiscoverInput -> { recipes: InspirationRecipe[] }  (503 without OpenAI)
// POST api/discover/import      body { recipe: InspirationRecipe } -> Dish
// PUT  api/inspirations/saved   body InspirationRecipe[] -> InspirationRecipe[]
export type DiscoverInput = { request: string; cuisine: InspirationCuisine | "Alle" };

// Weekly plans from Danish food sites ------------------------------------------------
// GET api/weekly-plans[?refresh=1]  -> WeeklyPlansResponse
//   Current ISO week's published meal plans (and next week's, when already out). Cached on the server.
export type WeeklyPlanDish = {
  /** 0 = Monday … 6 = Sunday. */
  day: number;
  recipe: InspirationRecipe;
};
export type WeeklyPlan = {
  id: string;
  sourceName: string;
  /** The post's own title, e.g. "Vegetarisk madplan uge 46, 2026". */
  title: string;
  url: string;
  /** ISO week number the plan covers. */
  week: number;
  /** Monday of that week (YYYY-MM-DD). */
  weekStart: string;
  dishes: WeeklyPlanDish[];
};
export type WeeklyPlansResponse = {
  week: number;
  weekStart: string;
  /** ISO timestamp of the last successful fetch, or null if nothing has been fetched yet. */
  fetchedAt: string | null;
  plans: WeeklyPlan[];
  /** Sources that could not be read this time (Danish message). */
  failures: { sourceName: string; message: string }[];
};

// Assist (chat) -----------------------------------------------------------------
// POST   api/assist                       body AssistRequest -> AssistResponse
//          503 with a Danish message when neither OpenAI nor the Home Assistant agent is available.
// POST   api/assist/proposals/:id/apply                       -> AssistApplyResult (404 if unknown or expired)
// DELETE api/assist/proposals/:id                             -> 204 (404 if unknown or expired)
// The assistant only ever PROPOSES typed actions. Nothing changes until the user applies the proposal,
// and every action is validated again at apply time against the then-current data.
export type AssistChatMessage = { role: "user" | "assistant"; content: string };
export type AssistContext = {
  /** Current view: "uge" | "indkob" | "retter" | "opskrift" | "planlaeg" | "indstillinger" | other. */
  view: string;
  /** Focused day (YYYY-MM-DD), when the view has one. */
  date?: string;
  /** Focused dish, e.g. the recipe being read. */
  dishId?: string;
};
export type AssistRequest = {
  messages: AssistChatMessage[];
  context: AssistContext;
  /** Home Assistant agent only: echo of the previous response's conversationId, to keep the chat. */
  conversationId?: string;
};
export type AssistEngine = "openai" | "homeassistant";
export type AssistResponse = {
  reply: string;
  /** Which engine really answered, so the UI can label it honestly. */
  engine: AssistEngine;
  /** Only the OpenAI engine can propose changes. */
  proposal?: AssistProposal;
  conversationId?: string;
};

/** Safe, typed operations. `label` is Danish, generated by the server, and shown in the preview. */
export type AssistAction =
  | { type: "setMeal"; date: string; dishId: string; label: string }
  | { type: "removeMeal"; date: string; label: string }
  | { type: "swapMeals"; a: string; b: string; label: string }
  | { type: "lockMeal"; date: string; locked: boolean; label: string }
  | { type: "addShoppingExtra"; item: string; label: string }
  | { type: "addFridgeItem"; name: string; quantity?: string; expiresOn?: string; label: string }
  | { type: "removeFridgeItem"; name: string; label: string }
  | { type: "addGlobalExclusion"; term: string; label: string }
  | {
      type: "updateProfile";
      profileId: string;
      /** exclusions are hard (never planned); preferences and dislikes are soft. */
      field: ProfileTermField;
      term: string;
      /** True removes the term instead of adding it. */
      remove: boolean;
      label: string;
    }
  | { type: "createDish"; dish: DishInput; label: string }
  | { type: "startPlanDraft"; request: PlanRequest; label: string };
export type AssistActionType = AssistAction["type"];
export type ProfileTermField = "preferences" | "dislikes" | "exclusions";

export type AssistProposal = {
  id: string;
  /** Danish one-liner describing the whole proposal. */
  summary: string;
  actions: AssistAction[];
  /** ISO timestamp; applying after this is refused. */
  expiresAt: string;
};
export type AssistActionResult = { label: string; ok: boolean; message?: string };
export type AssistApplyResult = { applied: number; results: AssistActionResult[] };

// Import / export ---------------------------------------------------------------
// POST api/import/v1   body unknown (a v1 MealPlanState JSON) -> ImportResult  (409 unless database is empty)
// GET  api/export      -> ExportFile (download)
export type ImportResult = {
  warnings: string[];
  counts: { meals: number; dishes: number; profiles: number };
};
export type ExportFile = {
  format: "madplan-export";
  version: 2;
  exportedAt: string;
  data: Omit<BootstrapResponse, "revision" | "capabilities" | "isEmpty">;
};

// Live updates ------------------------------------------------------------------
// GET api/events  (text/event-stream)  event "change", data ChangeEvent; a comment ping every 25 s.
export type ChangeTopic =
  | "meals"
  | "dishes"
  | "shopping"
  | "household"
  | "settings"
  | "drafts"
  | "inspirations";
export type ChangeEvent = { revision: number; topics: ChangeTopic[] };

// The API client both sides agree on (web implements it over fetch, and a fake in memory).
export type ShoppingQuery = { from?: string; to?: string };
