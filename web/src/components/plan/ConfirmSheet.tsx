import { Sheet } from "@/components/ui/Sheet";

type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  /** "danger" (default) for destructive actions, "accent" when going ahead is fine but worth a second look. */
  tone?: "danger" | "accent";
  /** Extra lines under the body, e.g. the rules a plan breaks. */
  details?: readonly string[];
  onClose: () => void;
  onConfirm: () => void;
};

/** Two-button confirmation for destructive actions. */
export function ConfirmSheet({ open, title, body, confirmLabel, tone = "danger", details = [], onClose, onConfirm }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4 px-3 pb-3">
        <p className="m-0 text-[15px] leading-relaxed text-ink-2">{body}</p>
        {details.length > 0 ? (
          <ul className="m-0 flex flex-col gap-1.5 pl-5 text-[15px] leading-snug text-ink-2">
            {details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
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
            className={`h-14 rounded-full text-base font-semibold ${tone === "danger" ? "bg-danger text-on-accent" : "bg-accent text-on-accent"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
