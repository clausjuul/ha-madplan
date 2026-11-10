import { dismissNotice, useNotice } from "@/lib/notify";

/** Gentle, non-blocking message at the bottom of the screen, optionally with one action (e.g. Fortryd). */
export function Toast() {
  const notice = useNotice();
  if (!notice) return null;
  const { action } = notice;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-8"
    >
      <div
        key={notice.id}
        className="sheet-panel pointer-events-auto flex max-w-[480px] items-center rounded-2xl border border-line bg-raised text-[15px] leading-snug text-ink shadow-xl"
      >
        <button type="button" onClick={dismissNotice} className="px-5 py-3 text-left">
          {notice.message}
        </button>
        {action ? (
          <button
            type="button"
            onClick={() => {
              dismissNotice();
              action.run();
            }}
            className="mr-1.5 h-11 shrink-0 rounded-full px-4 font-semibold text-accent hover:bg-accent-soft"
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
