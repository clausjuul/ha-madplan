import type {
  OffersStatus,
  OffersResponse,
  AssistApplyResult,
  AssistRequest,
  AssistResponse,
  BootstrapResponse,
  ChangeEvent,
  DiscoverInput,
  WeeklyPlansResponse,
  Dish,
  DishInput,
  DraftDayPatch,
  ExportFile,
  FridgeItem,
  HealthResponse,
  ImportResult,
  ImportUrlInput,
  InspirationRecipe,
  Meal,
  MealInput,
  MealMap,
  PlanDraftRecord,
  PlanRequest,
  Profile,
  Settings,
  ShoppingList,
  ShoppingQuery,
  SuggestDayInput,
  SwapMealsInput,
} from "@madplan/domain";

/** Typed error carrying the Danish `message` from the API (or a local fallback for network failures). */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }

  /** True for failures where no response arrived (offline, server down). */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export type ConnectionHandlers = {
  onChange: (event: ChangeEvent) => void;
  onConnection: (connected: boolean) => void;
};

/** Mirrors the HTTP contract in @madplan/domain api.ts. Implemented over fetch and in memory. */
export interface ApiClient {
  readonly mode: "http" | "fake";
  health(): Promise<HealthResponse>;
  bootstrap(): Promise<BootstrapResponse>;

  putMeal(date: string, input: MealInput): Promise<Meal>;
  patchMeal(date: string, patch: Partial<MealInput>): Promise<Meal>;
  deleteMeal(date: string): Promise<void>;
  swapMeals(input: SwapMealsInput): Promise<MealMap>;
  suggestMeal(date: string, input: SuggestDayInput): Promise<Meal>;

  createDish(input: DishInput): Promise<Dish>;
  updateDish(id: string, input: DishInput): Promise<Dish>;
  archiveDish(id: string): Promise<Dish>;
  restoreDish(id: string): Promise<Dish>;
  importDishFromUrl(input: ImportUrlInput): Promise<Dish>;

  getShopping(query?: ShoppingQuery): Promise<ShoppingList>;
  toggleShoppingItem(itemId: string): Promise<ShoppingList>;
  addShoppingExtra(label: string): Promise<ShoppingList>;
  removeShoppingExtra(itemId: string): Promise<ShoppingList>;
  resetShopping(): Promise<ShoppingList>;

  putFridge(items: FridgeItem[]): Promise<FridgeItem[]>;
  putPantry(items: string[]): Promise<string[]>;
  putProfiles(profiles: Profile[]): Promise<Profile[]>;
  putSettings(settings: Settings): Promise<Settings>;

  currentDraft(): Promise<PlanDraftRecord | null>;
  createDraft(request: PlanRequest): Promise<PlanDraftRecord>;
  patchDraftDay(id: string, date: string, patch: DraftDayPatch): Promise<PlanDraftRecord>;
  regenerateDraft(id: string, dates?: string[]): Promise<PlanDraftRecord>;
  applyDraft(id: string): Promise<{ meals: MealMap; addedDishes: Dish[] }>;
  discardDraft(id: string): Promise<void>;

  discover(input: DiscoverInput): Promise<{ recipes: InspirationRecipe[] }>;
  importInspiration(recipe: InspirationRecipe): Promise<Dish>;
  saveInspirations(recipes: InspirationRecipe[]): Promise<InspirationRecipe[]>;
  /** This week's meal plans from Danish food sites; `refresh` asks the server to fetch again. */
  weeklyPlans(refresh?: boolean): Promise<WeeklyPlansResponse>;

  /** Offers from Prej: status of the daily fetch, and the "Hent tilbud nu" button. */
  offersStatus(): Promise<OffersStatus>;
  /** The stored offers (never makes a call to Prej). */
  offers(): Promise<OffersResponse>;
  refreshOffers(): Promise<OffersStatus>;

  /** With `onReply`, the answer is streamed: called with the reply text so far while the model writes. */
  assist(request: AssistRequest, onReply?: (replySoFar: string) => void): Promise<AssistResponse>;
  /** `only`: indexes of the actions to run (all when omitted). */
  applyAssistProposal(id: string, only?: number[]): Promise<AssistApplyResult>;
  discardAssistProposal(id: string): Promise<void>;
  /** Puts back what an applied proposal changed (404 when too late, 409 when the data changed since). */
  undoAssist(undoId: string): Promise<void>;

  importV1(body: unknown): Promise<ImportResult>;
  exportData(): Promise<ExportFile>;

  /** Live updates (SSE `api/events`). Returns an unsubscribe function. */
  subscribe(handlers: ConnectionHandlers): () => void;
}
