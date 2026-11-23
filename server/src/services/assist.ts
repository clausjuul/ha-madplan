/** Assist chat: picks the engine, creates proposals (kept in SQLite until they expire) and applies them. */
import { randomUUID } from "node:crypto";
import type {
  AssistApplyResult,
  AssistProposal,
  AssistRequest,
  AssistResponse,
} from "@madplan/domain";
import { AiError } from "../ai/openai.ts";
import { findDishImage } from "../ai/dish-image.ts";
import { importRecipeFromUrl } from "../ai/recipe-import.ts";
import { askAssistModel, assistPrompt, assistSchema, correctionPrompt } from "../ai/assist-ai.ts";
import type { AssistModelAnswer } from "../ai/assist-ai.ts";
import type { Deps } from "../deps.ts";
import { HttpError, notFound, unavailable } from "../errors.ts";
import { askHomeAssistantAgent, haAgentAvailable } from "../ha/agent.ts";
import { one, run, text, toJson } from "../repo.ts";
import { currentShoppingList, snapshot } from "../state.ts";
import { envFromDb, MAX_ACTIONS, parseAssistActions } from "./assist-actions.ts";
import type { ActionEnv } from "./assist-actions.ts";
import { applyActions, undoApply } from "./assist-exec.ts";

export const PROPOSAL_TTL_MS = 30 * 60 * 1000;
const MAX_PROPOSALS = 50;
const NO_ENGINE =
  "Assist er ikke tilgængelig. Tilføj en OpenAI API-nøgle i appens konfiguration, eller slå en samtaleagent til i Home Assistant.";

export type ProposalStore = {
  create(deps: Deps, summary: string, actions: AssistProposal["actions"]): AssistProposal;
  /** Live proposal or a 404 (unknown and expired look the same to the caller, expired ones are dropped). */
  take(deps: Deps, id: string): AssistProposal;
  drop(deps: Deps, id: string): void;
};

/** Deletes expired proposals (and trims to the newest MAX_PROPOSALS). Called at startup and on every read. */
export function purgeExpiredProposals(deps: Deps): void {
  const { db } = deps.repo;
  run(db, "DELETE FROM assist_proposals WHERE expires_at <= ?", deps.now().toISOString());
  run(
    db,
    "DELETE FROM assist_proposals WHERE id NOT IN (SELECT id FROM assist_proposals ORDER BY expires_at DESC LIMIT ?)",
    MAX_PROPOSALS,
  );
}

/** Proposals live in SQLite (table assist_proposals) so they survive a restart; they are not household data. */
export function createProposalStore(deps: Deps): ProposalStore {
  purgeExpiredProposals(deps);
  return {
    create(d, summary, actions) {
      purgeExpiredProposals(d);
      const proposal: AssistProposal = {
        id: randomUUID(),
        summary,
        actions,
        expiresAt: new Date(d.now().getTime() + PROPOSAL_TTL_MS).toISOString(),
      };
      run(d.repo.db, "INSERT INTO assist_proposals (id, json, expires_at) VALUES (?, ?, ?)", proposal.id, toJson(proposal), proposal.expiresAt);
      return proposal;
    },
    take(d, id) {
      const row = one(d.repo.db, "SELECT json, expires_at FROM assist_proposals WHERE id = ?", id);
      if (!row) {
        purgeExpiredProposals(d);
        throw notFound("Forslaget findes ikke (mere). Bed Assist om det igen.");
      }
      const expired = text(row, "expires_at") <= d.now().toISOString();
      purgeExpiredProposals(d);
      if (expired) throw new HttpError(404, "expired", "Forslaget er udløbet. Bed Assist om det igen.");
      return JSON.parse(text(row, "json")) as AssistProposal;
    },
    drop: (d, id) => run(d.repo.db, "DELETE FROM assist_proposals WHERE id = ?", id),
  };
}
const lastUserText = (request: AssistRequest): string =>
  [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";

export type AssistProgress = (replySoFar: string) => void;

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Turns the model's photo requests into concrete actions: findDishImage becomes setDishImage, and
 * createDish with findImage gets an imageUrl. The photos are looked up here, in parallel, so the user sees
 * them in the proposal. Requests that find nothing are left out and reported in `notes`.
 */
export async function resolveImageRequests(
  deps: Deps,
  env: ActionEnv,
  rawActions: readonly unknown[],
  signal: AbortSignal,
): Promise<{ rawActions: unknown[]; notes: string[] }> {
  const notes: string[] = [];
  const lookup = (name: string) =>
    findDishImage(deps.openai, deps.config.planModel, deps.fetch, name, signal).catch(() => null);
  const resolved = await Promise.all(
    rawActions.slice(0, MAX_ACTIONS).map(async (raw): Promise<unknown> => {
      if (!isRecord(raw)) return raw;
      if (raw.type === "importDishFromUrl") {
        if (typeof raw.url !== "string") return null;
        try {
          const recipe = await importRecipeFromUrl(raw.url, deps.fetch, signal);
          return { type: "createDish", dish: recipe };
        } catch (error) {
          notes.push(`Opskriften kunne ikke hentes: ${error instanceof Error ? error.message : "ukendt fejl"}`);
          return null;
        }
      }
      if (raw.type === "findDishImage") {
        const dish = typeof raw.dishId === "string" ? env.dish(raw.dishId) : undefined;
        if (!dish) return null;
        const found = await lookup(dish.name);
        if (!found) {
          notes.push(`Jeg fandt ikke et brugbart billede af ${dish.name}.`);
          return null;
        }
        return { type: "setDishImage", dishId: dish.id, imageUrl: found.imageUrl, sourceUrl: found.sourceUrl };
      }
      if (raw.type === "createDish" && raw.findImage === true && isRecord(raw.dish) && typeof raw.dish.name === "string") {
        const found = await lookup(raw.dish.name);
        if (!found) {
          notes.push(`Jeg fandt ikke et brugbart billede af ${raw.dish.name}.`);
          return raw;
        }
        return { ...raw, dish: { ...raw.dish, imageUrl: found.imageUrl, sourceUrl: found.sourceUrl } };
      }
      return raw;
    }),
  );
  return { rawActions: resolved.filter((entry) => entry !== null), notes };
}

const wantsImages = (rawActions: readonly unknown[]): boolean =>
  rawActions.some((raw) => isRecord(raw) && (raw.type === "findDishImage" || raw.type === "importDishFromUrl" || (raw.type === "createDish" && raw.findImage === true)));

async function answerWithOpenAi(
  deps: Deps,
  store: ProposalStore,
  request: AssistRequest,
  onReply?: AssistProgress,
  cancel?: AbortSignal,
): Promise<AssistResponse> {
  const state = snapshot(deps);
  const env = envFromDb(deps);
  const prompt = assistPrompt({ state, env, context: request.context, messages: request.messages, shopping: currentShoppingList(deps) });
  const schema = assistSchema(state);
  // Stops when the person presses stop (the request is aborted) or after 90 seconds.
  const signal = cancel ? AbortSignal.any([AbortSignal.timeout(90_000), cancel]) : AbortSignal.timeout(90_000);
  let answer: AssistModelAnswer;
  try {
    answer = await askAssistModel(deps.openai, deps.config.planModel, prompt, { schema, signal, ...(onReply ? { onReply } : {}) });
  } catch (error) {
    if (error instanceof AiError) throw new HttpError(502, "ai_failed", error.message);
    throw error;
  }
  const notes: string[] = [];
  const withImages = async (rawActions: unknown[]): Promise<unknown[]> => {
    if (!wantsImages(rawActions)) return rawActions;
    onReply?.(`${answer.reply}\n\nHenter fra nettet…`);
    const imageSignal = cancel ? AbortSignal.any([AbortSignal.timeout(60_000), cancel]) : AbortSignal.timeout(60_000);
    const result = await resolveImageRequests(deps, env, rawActions, imageSignal);
    notes.splice(0, notes.length, ...result.notes);
    return result.rawActions;
  };
  let parsed = parseAssistActions(await withImages(answer.rawActions), env);
  if (parsed.dropped.length > 0) {
    // One self-correction round: the model sees why actions were refused and may fix them.
    onReply?.(`${answer.reply}\n\nTjekker forslaget mod jeres regler…`);
    try {
      const retry = await askAssistModel(deps.openai, deps.config.planModel, correctionPrompt(prompt, answer.raw, parsed.dropped), { schema, signal });
      const retried = parseAssistActions(await withImages(retry.rawActions), env);
      if (retried.dropped.length < parsed.dropped.length || retried.actions.length > parsed.actions.length) {
        answer = retry;
        parsed = retried;
      }
    } catch {
      // Keep the first answer; it stays honest because of the note below.
    }
  }
  const { actions, dropped } = parsed;
  // Say what was left out and why ("Torsdag er låst"), not just how many.
  const shown = dropped.slice(0, 4).map((reason) => `• ${reason}`);
  if (dropped.length > shown.length) shown.push(`• og ${dropped.length - shown.length} mere`);
  const ruleNote = dropped.length > 0
    ? `\n\n${dropped.length === 1 ? "1 forslag blev fjernet" : `${dropped.length} forslag blev fjernet`}, fordi det ikke passer med jeres regler:\n${shown.join("\n")}`
    : "";
  const note = ruleNote + (notes.length > 0 ? `\n\n${notes.join("\n")}` : "");
  if (actions.length === 0) return { reply: answer.reply + note, engine: "openai" };
  const proposal = store.create(deps, answer.reply.slice(0, 200), actions);
  return { reply: answer.reply + note, engine: "openai", proposal };
}

async function answerWithHomeAssistant(deps: Deps, request: AssistRequest): Promise<AssistResponse> {
  const answer = await askHomeAssistantAgent(
    deps.config,
    deps.fetch,
    lastUserText(request),
    request.conversationId,
    AbortSignal.timeout(60_000),
  );
  return { reply: answer.text, engine: "homeassistant", ...(answer.conversationId ? { conversationId: answer.conversationId } : {}) };
}

/** `cancel` aborts the model call when the person stops waiting (the HTTP request is aborted). */
export function assist(
  deps: Deps,
  store: ProposalStore,
  request: AssistRequest,
  onReply?: AssistProgress,
  cancel?: AbortSignal,
): Promise<AssistResponse> {
  if (deps.openai.configured) return answerWithOpenAi(deps, store, request, onReply, cancel);
  if (haAgentAvailable(deps.config)) return answerWithHomeAssistant(deps, request);
  throw unavailable(NO_ENGINE);
}

export function applyProposal(deps: Deps, store: ProposalStore, id: string, only?: readonly number[]): AssistApplyResult {
  const proposal = store.take(deps, id);
  // One shot: a proposal can never be applied twice.
  store.drop(deps, id);
  const chosen = only?.filter((index) => index < proposal.actions.length);
  const { results, undoId } = applyActions(deps, proposal.actions, chosen);
  return { applied: results.filter((result) => result.ok).length, results, ...(undoId ? { undoId } : {}) };
}

export const undoProposal = (deps: Deps, undoId: string): void => undoApply(deps, undoId);

export function discardProposal(deps: Deps, store: ProposalStore, id: string): void {
  store.take(deps, id);
  store.drop(deps, id);
}
