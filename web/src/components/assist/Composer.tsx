import { ArrowUp, Mic } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useSpeech } from "@/hooks/use-speech";

type Props = { disabled: boolean; onSend: (text: string) => void };

const button = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors";

/**
 * Message input in the style of Astryx' ChatComposer: one rounded card that holds an
 * auto-growing textarea on top and an action row (dictation, send) underneath.
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
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
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
      className="flex cursor-text flex-col gap-2 rounded-[24px] border border-line bg-surface p-3 shadow-[0_4px_16px_rgb(0_0_0/0.18)] transition-[border-color,box-shadow] focus-within:border-accent"
    >
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
        className="w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-snug text-ink outline-none placeholder:text-muted"
      />
      <div className="flex items-center gap-2">
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
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          className={`${button} ml-auto ${canSend ? "bg-accent text-on-accent" : "bg-raised text-muted"}`}
        >
          <ArrowUp size={18} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
