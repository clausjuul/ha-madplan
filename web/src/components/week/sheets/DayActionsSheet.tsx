import type { ReactNode } from "react";
import { ArrowLeftRight, Lock, LockOpen, Replace, Shuffle, Sparkles, StickyNote, Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import type { DayModel } from "@/lib/week-model";

export type DayAction = "pick" | "suggest" | "swap" | "lock" | "note" | "variant" | "remove";

type RowProps = {
  icon: ReactNode;
  label: string;
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
};

function ActionRow({ icon, label, hint, disabled, danger, onClick }: RowProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-[56px] w-full items-center gap-4 rounded-2xl px-3 py-2 text-left hover:bg-raised disabled:opacity-40 disabled:hover:bg-transparent ${
        danger ? "text-danger" : "text-ink"
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium">{label}</span>
        {hint ? <span className="block text-[13px] text-muted">{hint}</span> : null}
      </span>
    </button>
  );
}

type Props = {
  day: DayModel | null;
  onClose: () => void;
  onAction: (action: DayAction) => void;
};

export function DayActionsSheet({ day, onClose, onAction }: Props) {
  const locked = Boolean(day?.locked);
  const hasMeal = Boolean(day?.dish);
  return (
    <Sheet
      open={day !== null}
      onClose={onClose}
      title={day?.dish?.name ?? "Ingen ret endnu"}
      subtitle={day ? day.longLabel + (day.isToday ? " · i dag" : "") : undefined}
    >
      {day ? (
        <div className="flex flex-col gap-0.5">
          {locked ? (
            <p className="mx-3 mb-2 rounded-2xl bg-raised px-4 py-3 text-sm text-ink-2">
              Dagen er låst. Lås den op, hvis du vil bytte eller fjerne retten.
            </p>
          ) : null}
          <ActionRow
            icon={<ArrowLeftRight size={20} aria-hidden="true" />}
            label="Byt ret"
            hint="Vælg blandt dine retter"
            disabled={locked}
            onClick={() => onAction("pick")}
          />
          <ActionRow
            icon={<Sparkles size={20} aria-hidden="true" />}
            label="Foreslå ny"
            hint="Forslag ud fra dine retter, køleskab og historik"
            disabled={locked}
            onClick={() => onAction("suggest")}
          />
          <ActionRow
            icon={<Shuffle size={20} aria-hidden="true" />}
            label="Byt med anden dag"
            disabled={locked || !hasMeal}
            onClick={() => onAction("swap")}
          />
          <ActionRow
            icon={locked ? <LockOpen size={20} aria-hidden="true" /> : <Lock size={20} aria-hidden="true" />}
            label={locked ? "Lås op" : "Lås"}
            hint={locked ? undefined : "Beskytter dagen mod ændringer"}
            disabled={!hasMeal}
            onClick={() => onAction("lock")}
          />
          <ActionRow
            icon={<Replace size={20} aria-hidden="true" />}
            label="Byt en del for én"
            hint={day.variantLines.join(" · ") || "Fx nuggets i stedet for bøf til én person"}
            disabled={!hasMeal}
            onClick={() => onAction("variant")}
          />
          <ActionRow
            icon={<StickyNote size={20} aria-hidden="true" />}
            label="Note"
            hint={day.meal?.note || undefined}
            disabled={!hasMeal}
            onClick={() => onAction("note")}
          />
          <ActionRow
            icon={<Trash2 size={20} aria-hidden="true" />}
            label="Fjern"
            danger
            disabled={locked || !hasMeal}
            onClick={() => onAction("remove")}
          />
        </div>
      ) : null}
    </Sheet>
  );
}
