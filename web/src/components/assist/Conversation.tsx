import { useEffect, useRef } from "react";
import type { AssistContext } from "@madplan/domain";
import { useAssistChat } from "@/hooks/use-assist-chat";
import { chipsFor, type ChatEntry } from "@/lib/assist-model";
import { Composer } from "./Composer";
import { ProposalCard } from "./ProposalCard";

type ChatApi = ReturnType<typeof useAssistChat>;

function Bubble({ entry, chat }: { entry: ChatEntry; chat: ChatApi }) {
  const mine = entry.role === "user";
  return (
    <li className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <p
        className={`m-0 max-w-[88%] whitespace-pre-wrap rounded-[20px] px-4 py-2.5 text-[15px] leading-snug ${
          mine ? "bg-accent text-on-accent" : entry.error ? "bg-raised text-danger" : "bg-raised text-ink"
        }`}
      >
        {entry.content}
      </p>
      {entry.proposal ? (
        <div className="w-full max-w-[96%]">
          <ProposalCard entry={entry} onApply={() => void chat.apply(entry)} onDismiss={() => void chat.dismiss(entry)} />
        </div>
      ) : null}
    </li>
  );
}

function QuickPrompts({ prompts, onPick }: { prompts: string[]; onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Forslag til spørgsmål">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onPick(prompt)}
          className="min-h-11 rounded-full border border-line bg-ground px-4 py-2 text-left text-[14px] text-ink-2 hover:text-ink"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

type Props = { context: AssistContext; chat: ChatApi; demo: boolean };

export function Conversation({ context, chat, demo }: Props) {
  const { session, busy } = chat;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [session.entries.length, busy]);
  const empty = session.entries.length === 0;

  return (
    <div className="flex h-full min-h-[360px] flex-col px-2 md:px-0">
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {empty ? (
          <div className="flex flex-col gap-4 pt-2">
            <p className="m-0 text-[15px] leading-relaxed text-ink-2">
              {demo
                ? "Det her er en demo. Spørg om noget, så får du et indbygget eksempelsvar."
                : "Spørg om madplanen, opskrifter eller indkøb. Jeg foreslår ændringer, men gør intet før du trykker Udfør."}
            </p>
            <QuickPrompts prompts={chipsFor(context)} onPick={(text) => void chat.send(text)} />
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-live="polite">
            {session.entries.map((entry) => (
              <Bubble key={entry.id} entry={entry} chat={chat} />
            ))}
            {busy ? <li className="text-[14px] text-muted">Assist tænker…</li> : null}
          </ul>
        )}
        <div ref={end} />
      </div>
      {empty ? null : (
        <div className="flex items-center justify-between gap-2 pb-2">
          <QuickPrompts prompts={chipsFor(context).slice(0, 1)} onPick={(text) => void chat.send(text)} />
          <button type="button" onClick={chat.reset} className="min-h-11 shrink-0 rounded-full px-3 text-[14px] font-medium text-ink-2 hover:text-ink">
            Ny samtale
          </button>
        </div>
      )}
      <Composer disabled={busy} onSend={(text) => void chat.send(text)} />
    </div>
  );
}
