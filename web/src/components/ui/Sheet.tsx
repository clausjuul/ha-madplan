import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small line under the title. */
  subtitle?: string;
  children: ReactNode;
  /** Tall sheets (pickers) take most of the screen. */
  tall?: boolean;
};

/**
 * Modal sheet on a native <dialog>: focus is trapped by the browser, Escape closes it,
 * a tap on the backdrop closes it. Bottom sheet on phones, centred panel on tablets.
 */
export function Sheet({ open, onClose, title, subtitle, children, tall }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!open) return <dialog ref={ref} className="sheet" aria-hidden="true" />;

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="pointer-events-none flex h-full w-full items-end justify-center md:items-center"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          className={`sheet-panel pointer-events-auto flex w-full flex-col overflow-hidden rounded-t-[28px] bg-surface text-ink shadow-2xl md:max-w-[560px] md:rounded-[28px] ${
            tall ? "h-[88dvh] md:h-[min(720px,88dvh)]" : "max-h-[88dvh]"
          }`}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <header className="flex items-start gap-3 px-6 pb-3 pt-5">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="font-display text-[22px] font-bold leading-tight">
                {title}
              </h2>
              {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Luk"
              className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-raised"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 md:px-4">{children}</div>
        </div>
      </div>
    </dialog>
  );
}
