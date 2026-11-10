import { Sheet } from "@/components/ui/Sheet";

type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
};

/** Two-button confirmation for destructive actions. */
export function ConfirmSheet({ open, title, body, confirmLabel, onClose, onConfirm }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4 px-3 pb-3">
        <p className="m-0 text-[15px] leading-relaxed text-ink-2">{body}</p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="h-14 rounded-full border border-line text-base font-semibold">
            Behold
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onConfirm();
            }}
            className="h-14 rounded-full bg-danger text-base font-semibold text-on-accent"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
