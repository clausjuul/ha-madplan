import { Mic, Send } from "lucide-react";
import { useState } from "react";
import { useSpeech } from "@/hooks/use-speech";

type Props = { disabled: boolean; onSend: (text: string) => void };

const round = "flex h-12 w-12 shrink-0 items-center justify-center rounded-full";

/** Message input with send and (when the browser supports it) Danish voice input. */
export function Composer({ disabled, onSend }: Props) {
  const [text, setText] = useState("");
  const speech = useSpeech((heard) => setText((current) => (current ? `${current} ${heard}` : heard)));

  const submit = (): void => {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText("");
  };

  return (
    <form
      className="flex items-end gap-2 border-t border-hairline px-1 pb-1 pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor="assist-input" className="sr-only">
        Skriv til Assist
      </label>
      <textarea
        id="assist-input"
        rows={1}
        value={text}
        placeholder={speech.listening ? "Lytter…" : "Skriv til Assist…"}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        className="max-h-32 min-h-12 flex-1 resize-none rounded-3xl border border-line bg-ground px-4 py-3 text-[15px] leading-snug text-ink outline-none placeholder:text-muted focus:border-accent"
      />
      {speech.supported ? (
        <button
          type="button"
          onClick={speech.toggle}
          aria-label={speech.listening ? "Stop lytning" : "Tal til Assist"}
          aria-pressed={speech.listening}
          className={`${round} ${speech.listening ? "bg-accent text-on-accent" : "bg-raised text-ink-2"}`}
        >
          <Mic size={20} aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        aria-label="Send"
        className={`${round} bg-accent text-on-accent disabled:opacity-40`}
      >
        <Send size={20} aria-hidden="true" />
      </button>
    </form>
  );
}
