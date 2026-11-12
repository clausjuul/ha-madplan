import type { ApiError, AssistRequest, AssistResponse, AssistStreamEvent, ChangeEvent, ShoppingQuery } from "@madplan/domain";
import { ApiRequestError, type ApiClient } from "./client";

const NETWORK_MESSAGE = "Kan ikke få forbindelse til Madplan. Tjek netværket og prøv igen.";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ApiError).message === "string"
  );
}

/** Resolves against document.baseURI so the Home Assistant Ingress path prefix is kept. */
function resolve(path: string): string {
  return new URL(path, document.baseURI).toString();
}

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(resolve(path), {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, "network", NETWORK_MESSAGE);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!response.ok) {
    if (isApiError(parsed)) throw new ApiRequestError(response.status, parsed.error, parsed.message);
    throw new ApiRequestError(response.status, "http", "Noget gik galt hos serveren. Prøv igen.");
  }
  return parsed as T;
}

const enc = encodeURIComponent;

/** POST api/assist/stream: NDJSON events; reply deltas go to onReply, the "done" event is the answer. */
async function streamAssist(input: AssistRequest, onReply: (replySoFar: string) => void): Promise<AssistResponse> {
  let response: Response;
  try {
    response = await fetch(resolve("api/assist/stream"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new ApiRequestError(0, "network", NETWORK_MESSAGE);
  }
  if (!response.ok || !response.body) {
    const parsed: unknown = await response.json().catch(() => undefined);
    if (isApiError(parsed)) throw new ApiRequestError(response.status, parsed.error, parsed.message);
    throw new ApiRequestError(response.status, "http", "Noget gik galt hos serveren. Prøv igen.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let reply = "";
  let result: AssistResponse | undefined;
  const handle = (line: string): void => {
    if (!line.trim()) return;
    let event: AssistStreamEvent;
    try {
      event = JSON.parse(line) as AssistStreamEvent;
    } catch {
      return;
    }
    if (event.type === "delta") {
      reply += event.text;
      onReply(reply);
    } else if (event.type === "done") {
      result = event.response;
    } else {
      throw new ApiRequestError(event.status, "assist", event.message);
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      lines.forEach(handle);
    }
    handle(pending);
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError(0, "network", NETWORK_MESSAGE);
  }
  if (!result) throw new ApiRequestError(0, "network", "Svaret fra Assist blev afbrudt. Prøv igen.");
  return result;
}

function shoppingPath(query?: ShoppingQuery): string {
  const params = new URLSearchParams();
  if (query?.from) params.set("from", query.from);
  if (query?.to) params.set("to", query.to);
  const suffix = params.toString();
  return suffix ? `api/shopping?${suffix}` : "api/shopping";
}

export function createHttpClient(): ApiClient {
  return {
    mode: "http",
    health: () => request("GET", "api/health"),
    bootstrap: () => request("GET", "api/bootstrap"),

    putMeal: (date, input) => request("PUT", `api/meals/${enc(date)}`, input),
    patchMeal: (date, patch) => request("PATCH", `api/meals/${enc(date)}`, patch),
    deleteMeal: (date) => request("DELETE", `api/meals/${enc(date)}`),
    swapMeals: (input) => request("POST", "api/meals/swap", input),
    suggestMeal: (date, input) => request("POST", `api/meals/${enc(date)}/suggest`, input),

    createDish: (input) => request("POST", "api/dishes", input),
    updateDish: (id, input) => request("PUT", `api/dishes/${enc(id)}`, input),
    archiveDish: (id) => request("POST", `api/dishes/${enc(id)}/archive`),
    restoreDish: (id) => request("POST", `api/dishes/${enc(id)}/restore`),
    importDishFromUrl: (input) => request("POST", "api/dishes/import-url", input),

    getShopping: (query) => request("GET", shoppingPath(query)),
    toggleShoppingItem: (itemId) => request("POST", "api/shopping/toggle", { itemId }),
    addShoppingExtra: (label) => request("POST", "api/shopping/extras", { label }),
    removeShoppingExtra: (itemId) => request("DELETE", `api/shopping/extras/${enc(itemId)}`),
    resetShopping: () => request("POST", "api/shopping/reset"),

    putFridge: (items) => request("PUT", "api/fridge", items),
    putPantry: (items) => request("PUT", "api/pantry", items),
    putProfiles: (profiles) => request("PUT", "api/profiles", profiles),
    putSettings: (settings) => request("PUT", "api/settings", settings),

    currentDraft: () => request("GET", "api/plan-drafts/current"),
    createDraft: (plan) => request("POST", "api/plan-drafts", plan),
    patchDraftDay: (id, date, patch) =>
      request("PATCH", `api/plan-drafts/${enc(id)}/days/${enc(date)}`, patch),
    regenerateDraft: (id, dates) =>
      request("POST", `api/plan-drafts/${enc(id)}/regenerate`, dates ? { dates } : {}),
    applyDraft: (id) => request("POST", `api/plan-drafts/${enc(id)}/apply`),
    discardDraft: (id) => request("DELETE", `api/plan-drafts/${enc(id)}`),

    discover: (input) => request("POST", "api/discover", input),
    importInspiration: (recipe) => request("POST", "api/discover/import", { recipe }),
    saveInspirations: (recipes) => request("PUT", "api/inspirations/saved", recipes),
    weeklyPlans: (refresh) => request("GET", refresh ? "api/weekly-plans?refresh=1" : "api/weekly-plans"),

    assist: (input, onReply) => (onReply ? streamAssist(input, onReply) : request("POST", "api/assist", input)),
    applyAssistProposal: (id, only) => request("POST", `api/assist/proposals/${enc(id)}/apply`, only ? { only } : {}),
    discardAssistProposal: (id) => request("DELETE", `api/assist/proposals/${enc(id)}`),
    undoAssist: async (undoId) => {
      await request("POST", `api/assist/undo/${enc(undoId)}`);
    },

    importV1: (body) => request("POST", "api/import/v1", body),
    exportData: () => request("GET", "api/export"),

    subscribe({ onChange, onConnection }) {
      const source = new EventSource(resolve("api/events"));
      source.addEventListener("open", () => onConnection(true));
      source.addEventListener("error", () => onConnection(false));
      source.addEventListener("change", (event) => {
        try {
          onChange(JSON.parse((event as MessageEvent<string>).data) as ChangeEvent);
        } catch {
          // Ignore malformed events; the next one will resync.
        }
      });
      return () => source.close();
    },
  };
}
