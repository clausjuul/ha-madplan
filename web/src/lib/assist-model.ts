/** Pure helpers for the Assist chat: context, quick prompts, previews, speech support, session storage. */
import type {
  AssistActionResult,
  AssistActionType,
  AssistChatMessage,
  AssistContext,
  AssistEngine,
  AssistProposal,
} from "@madplan/domain";
import type { Route } from "./route";

export type ProposalState = "pending" | "applied" | "dismissed" | "expired";

export type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Marks a failed request shown in the list; never sent back to the assistant. */
  error?: boolean;
  proposal?: AssistProposal;
  proposalState?: ProposalState;
  results?: AssistActionResult[];
};

export type AssistSession = {
  entries: ChatEntry[];
  conversationId?: string;
  engine?: AssistEngine;
};

export const EMPTY_SESSION: AssistSession = { entries: [] };

// Context and quick prompts ---------------------------------------------------

export function contextFor(route: Route): AssistContext {
  switch (route.name) {
    case "retter":
      return route.dishId ? { view: "opskrift", dishId: route.dishId } : { view: "retter" };
    case "lav-mad":
      return { view: "opskrift", dishId: route.dishId };
    default:
      return { view: route.name };
  }
}

const CHIPS: Record<string, string[]> = {
  uge: ["Byt torsdag ud med noget vegetarisk", "Hvad kan vi lave af det i køleskabet?"],
  indkob: ["Tilføj det vi mangler til tacos", "Hvad bruger vi mest af denne uge?"],
  opskrift: ["Kan den laves uden mælk?", "Hvad kan jeg servere til?"],
  retter: ["Foreslå en hurtig ret til en hverdag", "Hvilke retter har vi ikke spist længe?"],
  planlaeg: ["Lav en plan med mest vegetarisk"],
};
const GENERIC_CHIPS = ["Hvad skal vi have i aften?", "Hvad kan vi lave af det i køleskabet?"];

export function chipsFor(context: AssistContext): string[] {
  return CHIPS[context.view] ?? GENERIC_CHIPS;
}

// Messages sent to the server ---------------------------------------------------

const MAX_SENT = 20;

export function toApiMessages(entries: readonly ChatEntry[]): AssistChatMessage[] {
  return entries
    .filter((entry) => !entry.error && entry.content.trim().length > 0)
    .slice(-MAX_SENT)
    .map((entry) => ({ role: entry.role, content: entry.content.slice(0, 4000) }));
}

// Proposal preview ----------------------------------------------------------------

export type PreviewKind = "meal" | "shopping" | "fridge" | "household" | "dish" | "plan";

const KIND: Record<AssistActionType, PreviewKind> = {
  setMeal: "meal",
  removeMeal: "meal",
  swapMeals: "meal",
  lockMeal: "meal",
  addShoppingExtra: "shopping",
  addFridgeItem: "fridge",
  removeFridgeItem: "fridge",
  addGlobalExclusion: "household",
  updateProfile: "household",
  createDish: "dish",
  startPlanDraft: "plan",
};

export type PreviewLine = { label: string; kind: PreviewKind; result?: AssistActionResult };

/** One line per action, with its outcome once the proposal has been applied. */
export function previewLines(proposal: AssistProposal, results?: readonly AssistActionResult[]): PreviewLine[] {
  return proposal.actions.map((action, index) => {
    const result = results?.[index];
    return { label: action.label, kind: KIND[action.type], ...(result ? { result } : {}) };
  });
}

/** "Åbn kladden" is offered when a plan draft was actually started. */
export function startedPlanDraft(proposal: AssistProposal, results?: readonly AssistActionResult[]): boolean {
  return proposal.actions.some((action, index) => action.type === "startPlanDraft" && results?.[index]?.ok === true);
}

// Header text -----------------------------------------------------------------------

export function engineTitle(engine: AssistEngine, demo: boolean): { title: string; subtitle?: string } {
  if (demo) return { title: "Assist · Demo", subtitle: "Svarene er indbyggede eksempler, ikke en rigtig assistent" };
  if (engine === "homeassistant") return { title: "Assist · Home Assistant", subtitle: "Kan kun svare, ikke ændre" };
  return { title: "Assist · OpenAI" };
}

// Speech input ------------------------------------------------------------------------

export type SpeechResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
export type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};
export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** The browser's recognition constructor, or null when the Web Speech API is unavailable (hide the mic then). */
export function speechRecognitionCtor(target: unknown): SpeechRecognitionCtor | null {
  if (typeof target !== "object" || target === null) return null;
  const candidate = target as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  const ctor = candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition;
  return typeof ctor === "function" ? (ctor as SpeechRecognitionCtor) : null;
}

// Session storage ----------------------------------------------------------------------

const KEY = "madplan.assist.v1";
const MAX_STORED = 60;

export function loadSession(storage: Pick<Storage, "getItem"> | undefined): AssistSession {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return EMPTY_SESSION;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as AssistSession).entries)) return EMPTY_SESSION;
    return parsed as AssistSession;
  } catch {
    return EMPTY_SESSION;
  }
}

export function saveSession(storage: Pick<Storage, "setItem" | "removeItem"> | undefined, session: AssistSession): void {
  try {
    if (session.entries.length === 0) storage?.removeItem(KEY);
    else storage?.setItem(KEY, JSON.stringify({ ...session, entries: session.entries.slice(-MAX_STORED) }));
  } catch {
    // Storage may be blocked or full; the chat simply is not remembered.
  }
}

export function sessionStorageOrUndefined(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
