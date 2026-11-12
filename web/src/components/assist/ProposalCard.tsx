import { Link } from "react-router";
import {
  Calendar,
  Check,
  CookingPot,
  Refrigerator,
  ShoppingCart,
  Sparkles,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { routePath } from "@/lib/route";
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
  /** Ticks one action in or out; only offered when the proposal has more than one action. */
  onToggle?: (index: number) => void;
  onUndo?: () => void;
};

/** What the assistant wants to change, listed action by action. Nothing happens until "Udfør". */
export function ProposalCard({ entry, onApply, onDismiss, onToggle, onUndo }: Props) {
  const { proposal } = entry;
  if (!proposal) return null;
  const state = entry.proposalState ?? "pending";
  const lines = previewLines(proposal, entry.results);
  const running = state === "applied" && !entry.results;
  const unselected = entry.unselected ?? [];
  const selectable = state === "pending" && !!onToggle && lines.length > 1;
  const chosenCount = lines.length - unselected.length;

  return (
    <section aria-label="Forslag fra Assist" className="mt-2 flex flex-col gap-3 rounded-2xl border border-line bg-ground p-4">
      <h3 className="m-0 text-sm font-semibold text-ink-2">
        {entry.undone
          ? "Forslaget (fortrudt)"
          : state === "pending"
            ? "Assist foreslår"
            : state === "applied"
              ? "Forslaget"
              : "Forslaget (ikke udført)"}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {lines.map((line, index) => {
          const off = unselected.includes(index);
          const body = (
            <>
              <span className={`mt-0.5 shrink-0 ${off ? "text-muted opacity-50" : "text-muted"}`}>{ICONS[line.kind]}</span>
              <span className={`min-w-0 flex-1 ${off ? "text-muted line-through" : ""}`}>
                {line.label}
                {line.result ? (
                  <span className={`mt-0.5 flex items-center gap-1 text-[13px] no-underline ${line.result.ok ? "text-ok" : "text-danger"}`}>
                    {line.result.ok ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                    {line.result.ok ? (entry.undone ? "Fortrudt" : "Udført") : (line.result.message ?? "Kunne ikke udføres")}
                  </span>
                ) : null}
              </span>
            </>
          );
          return (
            <li key={index} className="text-[15px] leading-snug text-ink">
              {selectable ? (
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={!off}
                    onChange={() => onToggle?.(index)}
                    className="mt-1 h-4 w-4 shrink-0 accent-accent"
                  />
                  {body}
                </label>
              ) : (
                <span className="flex items-start gap-2.5">{body}</span>
              )}
            </li>
          );
        })}
      </ul>

      {state === "pending" ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onApply}
            disabled={chosenCount === 0}
            className="h-11 flex-1 rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent disabled:opacity-50"
          >
            {unselected.length > 0 && chosenCount > 0 ? `Udfør ${chosenCount} af ${lines.length}` : "Udfør"}
          </button>
          <button type="button" onClick={onDismiss} className="h-11 rounded-full bg-raised px-5 text-[15px] font-medium text-ink-2">
            Afvis
          </button>
        </div>
      ) : null}
      {running ? <p className="m-0 text-[13px] text-muted">Udfører…</p> : null}
      {entry.undoId && onUndo && !entry.undone ? (
        <button
          type="button"
          onClick={onUndo}
          className="flex h-10 items-center justify-center gap-2 self-start rounded-full bg-raised px-4 text-[14px] font-medium text-ink-2 hover:text-ink"
        >
          <Undo2 size={16} aria-hidden="true" />
          Fortryd
        </button>
      ) : null}
      {entry.undone ? <p className="m-0 text-[13px] text-muted">Fortrudt. Alt er som før.</p> : null}
      {state === "dismissed" ? <p className="m-0 text-[13px] text-muted">Afvist. Der er ikke ændret noget.</p> : null}
      {state === "expired" ? <p className="m-0 text-[13px] text-muted">Forslaget er udløbet. Bed Assist om det igen.</p> : null}
      {entry.results && !entry.undone && startedPlanDraft(proposal, entry.results) ? (
        <Link
          to={routePath({ name: "planlaeg" })}
          onClick={closeAssist}
          className="flex h-11 items-center justify-center rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent no-underline"
        >
          Åbn kladden
        </Link>
      ) : null}
    </section>
  );
}
