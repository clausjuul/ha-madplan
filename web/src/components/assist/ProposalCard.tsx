import {
  Calendar,
  Check,
  CookingPot,
  Refrigerator,
  ShoppingCart,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { routeHref } from "@/lib/route";
import { closeAssist } from "@/lib/assist-store";
import { previewLines, startedPlanDraft, type ChatEntry, type PreviewKind } from "@/lib/assist-model";

const ICONS: Record<PreviewKind, ReactNode> = {
  meal: <Calendar size={18} aria-hidden="true" />,
  shopping: <ShoppingCart size={18} aria-hidden="true" />,
  fridge: <Refrigerator size={18} aria-hidden="true" />,
  household: <UserRound size={18} aria-hidden="true" />,
  dish: <CookingPot size={18} aria-hidden="true" />,
  plan: <Sparkles size={18} aria-hidden="true" />,
};

type Props = {
  entry: ChatEntry;
  onApply: () => void;
  onDismiss: () => void;
};

/** What the assistant wants to change, listed action by action. Nothing happens until "Udfør". */
export function ProposalCard({ entry, onApply, onDismiss }: Props) {
  const { proposal } = entry;
  if (!proposal) return null;
  const state = entry.proposalState ?? "pending";
  const lines = previewLines(proposal, entry.results);
  const running = state === "applied" && !entry.results;

  return (
    <section aria-label="Forslag fra Assist" className="mt-2 flex flex-col gap-3 rounded-2xl border border-line bg-ground p-4">
      <h3 className="m-0 text-sm font-semibold text-ink-2">
        {state === "pending" ? "Assist foreslår" : state === "applied" ? "Forslaget" : "Forslaget (ikke udført)"}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {lines.map((line, index) => (
          <li key={index} className="flex items-start gap-2.5 text-[15px] leading-snug text-ink">
            <span className="mt-0.5 shrink-0 text-muted">{ICONS[line.kind]}</span>
            <span className="min-w-0 flex-1">
              {line.label}
              {line.result ? (
                <span className={`mt-0.5 flex items-center gap-1 text-[13px] ${line.result.ok ? "text-ok" : "text-danger"}`}>
                  {line.result.ok ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                  {line.result.ok ? "Udført" : (line.result.message ?? "Kunne ikke udføres")}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {state === "pending" ? (
        <div className="flex gap-2">
          <button type="button" onClick={onApply} className="h-11 flex-1 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent">
            Udfør
          </button>
          <button type="button" onClick={onDismiss} className="h-11 rounded-full bg-raised px-5 text-[15px] font-medium text-ink-2">
            Afvis
          </button>
        </div>
      ) : null}
      {running ? <p className="m-0 text-[13px] text-muted">Udfører…</p> : null}
      {state === "dismissed" ? <p className="m-0 text-[13px] text-muted">Afvist. Der er ikke ændret noget.</p> : null}
      {state === "expired" ? <p className="m-0 text-[13px] text-muted">Forslaget er udløbet. Bed Assist om det igen.</p> : null}
      {entry.results && startedPlanDraft(proposal, entry.results) ? (
        <a
          href={routeHref({ name: "planlaeg" })}
          onClick={closeAssist}
          className="flex h-11 items-center justify-center rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent no-underline"
        >
          Åbn kladden
        </a>
      ) : null}
    </section>
  );
}
