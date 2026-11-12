import { AlertCircle, ArrowDown, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistContext } from "@madplan/domain";
import { useAssistChat } from "@/hooks/use-assist-chat";
import { useBootstrap } from "@/api/queries";
import { useToday } from "@/hooks/use-today";
import { chipsFor, type ChatEntry, type ChipData } from "@/lib/assist-model";
import { Composer } from "./Composer";
import { ProposalCard } from "./ProposalCard";

type ChatApi = ReturnType<typeof useAssistChat>;
type Group = "single" | "first" | "middle" | "last";

/** Corner radii for consecutive messages from the same sender, like Astryx' ChatMessageBubble groups. */
const userCorners: Record<Group, string> = {
  single: "",
  first: "rounded-br-md",
  middle: "rounded-r-md",
  last: "rounded-tr-md",
};

function groupOf(entries: ChatEntry[], index: number): Group {
  const same = (other?: ChatEntry): boolean => !!other && !other.error && other.role === entries[index]!.role;
  const before = same(entries[index - 1]);
  const after = same(entries[index + 1]);
  return before && after ? "middle" : before ? "last" : after ? "first" : "single";
}

/** A failed request, shown centred and muted like Astryx' ChatSystemMessage. */
function SystemMessage({ children }: { children: string }) {
  return (
    <li className="flex justify-center py-1">
      <p className="m-0 flex max-w-[90%] items-start gap-2 text-center text-[13px] leading-snug text-danger">
        <AlertCircle size={15} aria-hidden="true" className="mt-px shrink-0" />
        <span>{children}</span>
      </p>
    </li>
  );
}

function Message({ entry, group, chat }: { entry: ChatEntry; group: Group; chat: ChatApi }) {
  if (entry.error) return <SystemMessage>{entry.content}</SystemMessage>;
  const mine = entry.role === "user";
  const startsGroup = group === "single" || group === "first";

  if (mine) {
    return (
      <li className={`flex justify-end ${startsGroup ? "pt-2" : ""}`}>
        <p
          className={`m-0 max-w-[max(80%,280px)] whitespace-pre-wrap break-words rounded-[20px] bg-raised px-4 py-3 text-[15px] leading-snug text-ink ${userCorners[group]}`}
        >
          {entry.content}
        </p>
      </li>
    );
  }

  return (
    <li className={`flex gap-2.5 ${startsGroup ? "pt-2" : ""}`}>
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent ${startsGroup ? "" : "invisible"}`}
      >
        <Sparkles size={15} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        {startsGroup ? <span className="text-[13px] font-semibold text-ink-2">Assist</span> : null}
        <p className="m-0 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">{entry.content}</p>
        {entry.proposal ? (
          <div className="w-full">
            <ProposalCard
              entry={entry}
              onApply={() => void chat.apply(entry)}
              onDismiss={() => void chat.dismiss(entry)}
              onToggle={(index) => chat.toggle(entry, index)}
              onUndo={() => void chat.undo(entry)}
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

function Thinking() {
  return (
    <li className="flex items-center gap-2.5 pt-2">
      <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Sparkles size={15} />
      </span>
      <span className="sr-only">Assist tænker…</span>
      <span aria-hidden="true" className="flex gap-1">
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </span>
    </li>
  );
}

function QuickPrompts({ prompts, onPick }: { prompts: string[]; onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Forslag til spørgsmål">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onPick(prompt)}
          className="min-h-10 rounded-full border border-line bg-surface px-4 py-2 text-left text-[14px] text-ink-2 hover:bg-raised hover:text-ink"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ demo, prompts, onPick }: { demo: boolean; prompts: string[]; onPick: (text: string) => void }) {
  return (
    <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Sparkles size={22} />
      </span>
      <p className="m-0 max-w-sm text-[15px] leading-relaxed text-ink-2">
        {demo
          ? "Det her er en demo. Spørg om noget, så får du et indbygget eksempelsvar."
          : "Spørg om madplanen, opskrifter eller indkøb. Jeg foreslår ændringer, men gør intet før du trykker Udfør."}
      </p>
      <QuickPrompts prompts={prompts} onPick={onPick} />
    </div>
  );
}

type Props = { context: AssistContext; chat: ChatApi; demo: boolean };

/** Chat layout after Astryx' ChatLayout: scrolling message area, docked composer, scroll-to-latest button. */
export function Conversation({ context, chat, demo }: Props) {
  const { session, busy } = chat;
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const empty = session.entries.length === 0;
  const send = (text: string): void => void chat.send(text);
  const boot = useBootstrap().data;
  const today = useToday();
  const chipData: ChipData | undefined = boot ? { today, meals: boot.meals, fridge: boot.fridge, dishes: boot.dishes } : undefined;
  const chips = chipsFor(context, chipData);

  const scrollToEnd = useCallback((smooth: boolean) => {
    const el = scroller.current;
    el?.scrollTo?.({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => scrollToEnd(false), [session.entries.length, busy, scrollToEnd]);
  // Follows a streamed reply as it grows, unless the user scrolled up to read.
  const lastLength = session.entries.at(-1)?.content.length ?? 0;
  const follow = useRef(atBottom);
  follow.current = atBottom;
  useEffect(() => {
    if (follow.current) scrollToEnd(false);
  }, [lastLength, scrollToEnd]);

  return (
    <div className="relative flex h-full min-h-[360px] flex-col px-2 md:px-0">
      <div
        ref={scroller}
        onScroll={(event) => {
          const el = event.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
        }}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pb-6"
      >
        {empty ? (
          <EmptyState demo={demo} prompts={chips} onPick={send} />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-live="polite">
            {session.entries.map((entry, index) => (
              <Message key={entry.id} entry={entry} group={groupOf(session.entries, index)} chat={chat} />
            ))}
            {busy && !session.entries.some((entry) => entry.streaming) ? <Thinking /> : null}
          </ul>
        )}
      </div>

      <div className="relative">
        {!atBottom && !empty ? (
          <div className="pointer-events-none absolute inset-x-0 -top-14 flex justify-center">
            <button
              type="button"
              onClick={() => scrollToEnd(true)}
              aria-label="Gå til nyeste besked"
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-[0_4px_12px_rgb(0_0_0/0.25)]"
            >
              <ArrowDown size={18} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        {empty ? null : (
          <div className="flex items-center justify-between gap-2 pb-2">
            <QuickPrompts prompts={chips.slice(0, 1)} onPick={send} />
            <button type="button" onClick={chat.reset} className="min-h-10 shrink-0 rounded-full px-3 text-[14px] font-medium text-ink-2 hover:text-ink">
              Ny samtale
            </button>
          </div>
        )}
        <div className="pb-1">
          <Composer disabled={busy} onSend={send} />
        </div>
      </div>
    </div>
  );
}
