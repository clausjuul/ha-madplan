import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AssistContext } from "@madplan/domain";
import { ApiRequestError } from "@/api/client";
import { useApi } from "@/api/provider";
import {
  EMPTY_SESSION,
  loadSession,
  saveSession,
  sessionStorageOrUndefined,
  toApiMessages,
  type AssistSession,
  type ChatEntry,
} from "@/lib/assist-model";

const messageOf = (error: unknown): string =>
  error instanceof ApiRequestError ? error.message : "Det lykkedes ikke. Prøv igen.";

/** The server keeps an undo this long (UNDO_TTL_MS); after that the button is hidden instead of failing. */
const UNDO_MS = 10 * 60 * 1000;

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";

let counter = 0;
const nextId = (): string => `m${Date.now().toString(36)}-${(counter += 1)}`;

/** The conversation: kept for the browser session, sent to the server, proposals applied on request. */
export function useAssistChat(context: AssistContext) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AssistSession>(() => loadSession(sessionStorageOrUndefined()));
  const [busy, setBusy] = useState(false);
  const live = useRef(session);
  live.current = session;
  const running = useRef<AbortController | null>(null);

  useEffect(() => {
    saveSession(sessionStorageOrUndefined(), session);
  }, [session]);

  const patchEntry = useCallback((id: string, patch: Partial<ChatEntry>): void => {
    setSession((current) => ({
      ...current,
      entries: current.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    }));
  }, []);

  /** Sends `history` (which ends with the user's message) and adds the reply, or a failure that can be retried. */
  const ask = useCallback(
    async (history: ChatEntry[], content: string): Promise<void> => {
      const replyId = nextId();
      setSession((current) => ({ ...current, entries: history }));
      setBusy(true);
      const controller = new AbortController();
      running.current = controller;
      // The streamed reply appears as a growing message; the final response replaces it.
      const onReply = (text: string): void =>
        setSession((current) => {
          if (controller.signal.aborted) return current;
          const exists = current.entries.some((entry) => entry.id === replyId);
          const partial: ChatEntry = { id: replyId, role: "assistant", content: text, streaming: true };
          return {
            ...current,
            entries: exists
              ? current.entries.map((entry) => (entry.id === replyId ? { ...entry, content: text } : entry))
              : [...current.entries, partial],
          };
        });
      const withoutPartial = (entries: ChatEntry[]): ChatEntry[] => entries.filter((entry) => entry.id !== replyId);
      try {
        const response = await api.assist(
          {
            messages: toApiMessages(history),
            context,
            ...(live.current.conversationId ? { conversationId: live.current.conversationId } : {}),
          },
          onReply,
          controller.signal,
        );
        const reply: ChatEntry = {
          id: replyId,
          role: "assistant",
          content: response.reply,
          ...(response.proposal ? { proposal: response.proposal, proposalState: "pending" as const } : {}),
        };
        setSession((current) => ({
          entries: [...withoutPartial(current.entries), reply],
          engine: response.engine,
          ...(response.conversationId ? { conversationId: response.conversationId } : {}),
        }));
      } catch (error) {
        const stopped = controller.signal.aborted || isAbort(error);
        const failed: ChatEntry = {
          id: nextId(),
          role: "assistant",
          content: stopped ? "Stoppet. Der er ikke ændret noget." : `${messageOf(error)} Der er ikke ændret noget.`,
          error: true,
          retryText: content,
        };
        setSession((current) => ({ ...current, entries: [...withoutPartial(current.entries), failed] }));
      } finally {
        if (running.current === controller) running.current = null;
        setBusy(false);
      }
    },
    [api, context],
  );

  const send = useCallback(
    async (text: string): Promise<void> => {
      const content = text.trim();
      if (!content || busy) return;
      const user: ChatEntry = { id: nextId(), role: "user", content };
      await ask([...live.current.entries, user], content);
    },
    [ask, busy],
  );

  /** "Prøv igen" on a failed request: drops the failure and sends the same message once more. */
  const retry = useCallback(
    async (failed: ChatEntry): Promise<void> => {
      if (busy || !failed.retryText) return;
      const entries = live.current.entries.filter((entry) => entry.id !== failed.id);
      const last = entries.at(-1);
      // The user's message is still the last one: send it again without repeating it in the chat.
      if (last?.role === "user" && last.content === failed.retryText) await ask(entries, failed.retryText);
      else await ask([...entries, { id: nextId(), role: "user", content: failed.retryText }], failed.retryText);
    },
    [ask, busy],
  );

  /** Stops waiting for the answer; the server stops the model call too. */
  const stop = useCallback((): void => running.current?.abort(), []);

  /** "Spørg igen" on an expired proposal: asks the question that led to it once more. */
  const askAgain = useCallback(
    async (entry: ChatEntry): Promise<void> => {
      const entries = live.current.entries;
      const index = entries.findIndex((other) => other.id === entry.id);
      const question = entries.slice(0, index).reverse().find((other) => other.role === "user" && !other.error);
      if (question) await send(question.content);
    },
    [send],
  );

  const apply = useCallback(
    async (entry: ChatEntry): Promise<void> => {
      if (!entry.proposal) return;
      const unselected = entry.unselected ?? [];
      const only = unselected.length > 0
        ? entry.proposal.actions.map((_, index) => index).filter((index) => !unselected.includes(index))
        : undefined;
      patchEntry(entry.id, { proposalState: "applied", actionError: undefined });
      try {
        const result = await api.applyAssistProposal(entry.proposal.id, only);
        patchEntry(entry.id, {
          results: result.results,
          ...(result.undoId ? { undoId: result.undoId, undoUntil: Date.now() + UNDO_MS } : {}),
        });
        void queryClient.invalidateQueries();
      } catch (error) {
        const gone = error instanceof ApiRequestError && error.status === 404;
        patchEntry(entry.id, {
          proposalState: gone ? "expired" : "pending",
          results: undefined,
          ...(gone ? {} : { actionError: messageOf(error) }),
        });
      }
    },
    [api, patchEntry, queryClient],
  );

  const dismiss = useCallback(
    async (entry: ChatEntry): Promise<void> => {
      if (!entry.proposal) return;
      patchEntry(entry.id, { proposalState: "dismissed" });
      try {
        await api.discardAssistProposal(entry.proposal.id);
      } catch {
        // Already gone on the server: nothing to discard.
      }
    },
    [api, patchEntry],
  );

  /** Ticks an action in or out of a pending proposal. */
  const toggle = useCallback(
    (entry: ChatEntry, index: number): void => {
      const unselected = entry.unselected ?? [];
      patchEntry(entry.id, {
        unselected: unselected.includes(index) ? unselected.filter((other) => other !== index) : [...unselected, index],
      });
    },
    [patchEntry],
  );

  const undo = useCallback(
    async (entry: ChatEntry): Promise<void> => {
      if (!entry.undoId) return;
      patchEntry(entry.id, { actionError: undefined });
      try {
        await api.undoAssist(entry.undoId);
        patchEntry(entry.id, { undone: true, undoId: undefined });
        void queryClient.invalidateQueries();
      } catch (error) {
        // Too late (404) or changed since (409): the undo can never work, so the button goes away.
        const final = error instanceof ApiRequestError && (error.status === 404 || error.status === 409);
        patchEntry(entry.id, { actionError: messageOf(error), ...(final ? { undoId: undefined } : {}) });
      }
    },
    [api, patchEntry, queryClient],
  );

  const reset = useCallback((): void => {
    running.current?.abort();
    setSession(EMPTY_SESSION);
  }, []);

  return { session, busy, send, retry, stop, askAgain, apply, dismiss, toggle, undo, reset };
}
