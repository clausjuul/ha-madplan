import { useCallback, useEffect, useRef, useState } from "react";
import { speechRecognitionCtor, type SpeechRecognitionLike } from "@/lib/assist-model";

/** Danish voice input via the Web Speech API. `supported` is false when the browser has none (hide the mic). */
export function useSpeech(onText: (text: string) => void) {
  const ctor = typeof window === "undefined" ? null : speechRecognitionCtor(window);
  const [listening, setListening] = useState(false);
  const active = useRef<SpeechRecognitionLike | null>(null);
  const handler = useRef(onText);
  handler.current = onText;

  useEffect(() => () => active.current?.stop(), []);

  const toggle = useCallback(() => {
    if (!ctor) return;
    if (active.current) {
      active.current.stop();
      return;
    }
    const recognition = new ctor();
    recognition.lang = "da-DK";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) handler.current(transcript);
    };
    const finish = (): void => {
      active.current = null;
      setListening(false);
    };
    recognition.onend = finish;
    recognition.onerror = finish;
    active.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      finish();
    }
  }, [ctor]);

  return { supported: ctor !== null, listening, toggle };
}
