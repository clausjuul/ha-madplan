/** Assist chat: picks the engine, creates proposals (kept in SQLite until they expire) and applies them. */
import { randomUUID } from "node:crypto";
import type {
  AssistApplyResult,
  AssistProposal,
  AssistRequest,
  AssistResponse,
} from "@madplan/domain";
import { AiError } from "../ai/openai.ts";
import { askAssistModel, assistPrompt, assistSchema, correctionPrompt } from "../ai/assist-ai.ts";
import type { AssistModelAnswer } from "../ai/assist-ai.ts";
import type { Deps } from "../deps.ts";
import { HttpError, notFound, unavailable } from "../errors.ts";
import { askHomeAssistantAgent, haAgentAvailable } from "../ha/agent.ts";
import { one, run, text, toJson } from "../repo.ts";
import { currentShoppingList, snapshot } from "../state.ts";
import { envFromDb, parseAssistActions } from "./assist-actions.ts";
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

async function answerWithOpenAi(
  deps: Deps,
  store: ProposalStore,
  request: AssistRequest,
  onReply?: AssistProgress,
): Promise<AssistResponse> {
  const state = snapshot(deps);
  const env = envFromDb(deps);
  const prompt = assistPrompt({ state, env, context: request.context, messages: request.messages, shopping: currentShoppingList(deps) });
  const schema = assistSchema(state);
  const signal = AbortSignal.timeout(90_000);
  let answer: AssistModelAnswer;
  try {
    answer = await askAssistModel(deps.openai, deps.config.planModel, prompt, { schema, signal, ...(onReply ? { onReply } : {}) });
  } catch (error) {
    if (error instanceof AiError) throw new HttpError(502, "ai_failed", error.message);
    throw error;
  }
  let parsed = parseAssistActions(answer.rawActions, env);
  if (parsed.dropped.length > 0) {
    // One self-correction round: the model sees why actions were refused and may fix them.
    try {
      const retry = await askAssistModel(deps.openai, deps.config.planModel, correctionPrompt(prompt, answer.raw, parsed.dropped), { schema, signal });
      const retried = parseAssistActions(retry.rawActions, env);
      if (retried.dropped.length < parsed.dropped.length || retried.actions.length > parsed.actions.length) {
        answer = retry;
        parsed = retried;
      }
    } catch {
      // Keep the first answer; it stays honest because of the note below.
    }
  }
  const { actions, dropped } = parsed;
  const note = dropped.length > 0 ? `\n\n(${dropped.length} forslag blev fjernet, fordi de ikke overholdt jeres regler.)` : "";
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

export function assist(deps: Deps, store: ProposalStore, request: AssistRequest, onReply?: AssistProgress): Promise<AssistResponse> {
  if (deps.openai.configured) return answerWithOpenAi(deps, store, request, onReply);
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
