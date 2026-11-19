import { RotateCcw } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { PantryChips } from "./PantryChips";

type Props = {
  open: boolean;
  onClose: () => void;
  pantry: readonly string[];
  onPantryChange: (items: string[]) => void;
  onNewTrip: () => void;
  /** False when the browser cannot keep the screen on, so the sheet can say why the button is missing. */
  canKeepAwake: boolean;
};

/** Phone: what is not needed in the shop (basisvarer, a new trip) lives here, so the list is only the list. */
export function ShoppingMenuSheet({ open, onClose, pantry, onPantryChange, onNewTrip, canKeepAwake }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Indkøbslisten">
      <div className="flex flex-col gap-4 pb-2">
        <button
          type="button"
          onClick={() => {
            onClose();
            onNewTrip();
          }}
          className="flex h-14 items-center justify-center gap-2 rounded-full border border-line text-base font-semibold text-ink"
        >
          <RotateCcw size={18} aria-hidden="true" />
          Ny indkøbstur
        </button>
        <PantryChips pantry={pantry} onChange={onPantryChange} />
        {canKeepAwake ? null : (
          <p className="m-0 text-[13px] leading-normal text-muted">
            Denne browser kan ikke holde skærmen tændt (det kræver HTTPS). I Home Assistant-appen på Android kan det slås til
            under Indstillinger → Companion-app → Hold skærmen tændt.
          </p>
        )}
      </div>
    </Sheet>
  );
}
