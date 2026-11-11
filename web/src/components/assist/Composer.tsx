import { ArrowUp, Mic } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useSpeech } from "@/hooks/use-speech";

type Props = { disabled: boolean; onSend: (text: string) => void };

const button = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors";

/**
 * Message input in the style of Astryx' ChatComposer: one rounded card that holds an
 * dictation button, an auto-growing textarea and a send button on one row.
 */
export function Composer({ disabled, onSend }: Props) {
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeech((heard) => setText((current) => (current ? `${current} ${heard}` : heard)));
  const canSend = !disabled && text.trim().length > 0;

  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    // The sheet may still be hidden or animating in, which measures 0; keep the CSS height then.
    if (el.scrollHeight > 0) el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const submit = (): void => {
    if (!canSend) return;
    onSend(text);
    setText("");
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) input.current?.focus();
      }}
      className="flex shrink-0 cursor-text items-end gap-1 rounded-[24px] border border-line bg-surface p-1.5 shadow-[0_4px_16px_rgb(0_0_0/0.18)] transition-[border-color,box-shadow] focus-within:border-accent"
    >
      {speech.supported ? (
        <button
          type="button"
          onClick={speech.toggle}
          aria-label={speech.listening ? "Stop lytning" : "Tal til Assist"}
          aria-pressed={speech.listening}
          className={`${button} ${speech.listening ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-raised hover:text-ink"}`}
        >
          <Mic size={18} aria-hidden="true" />
        </button>
      ) : null}
      <label htmlFor="assist-input" className="sr-only">
        Skriv til Assist
      </label>
      <textarea
        ref={input}
        id="assist-input"
        rows={1}
        value={text}
        placeholder={speech.listening ? "Lytter…" : "Spørg Assist om madplanen…"}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        className="block h-11 min-h-11 min-w-0 flex-1 shrink-0 resize-none self-stretch overflow-y-auto bg-transparent px-2 py-2.5 text-[15px] leading-snug text-ink outline-none placeholder:text-muted focus-visible:outline-none"
      />
      <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          className={`${button} ${canSend ? "bg-accent text-on-accent" : "bg-raised text-muted"}`}
        >
          <ArrowUp size={18} strokeWidth={2.5} aria-hidden="true" />
        </button>
    </form>
  );
}
