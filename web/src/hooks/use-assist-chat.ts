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

  useEffect(() => {
    saveSession(sessionStorageOrUndefined(), session);
  }, [session]);

  const patchEntry = useCallback((id: string, patch: Partial<ChatEntry>): void => {
    setSession((current) => ({
      ...current,
      entries: current.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    }));
  }, []);

  const send = useCallback(
    async (text: string): Promise<void> => {
      const content = text.trim();
      if (!content || busy) return;
      const user: ChatEntry = { id: nextId(), role: "user", content };
      const history = [...live.current.entries, user];
      setSession((current) => ({ ...current, entries: history }));
      setBusy(true);
      try {
        const response = await api.assist({
          messages: toApiMessages(history),
          context,
          ...(live.current.conversationId ? { conversationId: live.current.conversationId } : {}),
        });
        const reply: ChatEntry = {
          id: nextId(),
          role: "assistant",
          content: response.reply,
          ...(response.proposal ? { proposal: response.proposal, proposalState: "pending" as const } : {}),
        };
        setSession((current) => ({
          entries: [...current.entries, reply],
          engine: response.engine,
          ...(response.conversationId ? { conversationId: response.conversationId } : {}),
        }));
      } catch (error) {
        const failed: ChatEntry = { id: nextId(), role: "assistant", content: messageOf(error), error: true };
        setSession((current) => ({ ...current, entries: [...current.entries, failed] }));
      } finally {
        setBusy(false);
      }
    },
    [api, busy, context],
  );

  const apply = useCallback(
    async (entry: ChatEntry): Promise<void> => {
      if (!entry.proposal) return;
      patchEntry(entry.id, { proposalState: "applied" });
      try {
        const result = await api.applyAssistProposal(entry.proposal.id);
        patchEntry(entry.id, { results: result.results });
        void queryClient.invalidateQueries();
      } catch (error) {
        const gone = error instanceof ApiRequestError && error.status === 404;
        patchEntry(entry.id, {
          proposalState: gone ? "expired" : "pending",
          results: undefined,
          ...(gone ? {} : { content: `${entry.content}\n\n${messageOf(error)}` }),
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

  const reset = useCallback((): void => setSession(EMPTY_SESSION), []);

  return { session, busy, send, apply, dismiss, reset };
}
