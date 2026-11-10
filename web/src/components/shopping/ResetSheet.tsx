import { Sheet } from "@/components/ui/Sheet";

type Props = { open: boolean; onClose: () => void; onConfirm: () => void };

/** Confirms "Ny indkøbstur": clears all ticks and extra items. */
export function ResetSheet({ open, onClose, onConfirm }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Start en ny indkøbstur?">
      <div className="flex flex-col gap-4 px-3 pb-3">
        <p className="text-[15px] leading-relaxed text-ink-2">
          Alle afkrydsninger og ekstra varer fjernes, og listen bygges forfra ud fra madplanen.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="h-14 rounded-full border border-line text-base font-semibold">
            Annuller
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="h-14 rounded-full bg-accent text-base font-semibold text-on-accent"
          >
            Ny indkøbstur
          </button>
        </div>
      </div>
    </Sheet>
  );
}
