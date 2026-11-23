import { useCallback, useEffect, useRef, useState } from "react";
import { speechRecognitionCtor, type SpeechRecognitionLike } from "@/lib/assist-model";

/** A short Danish explanation when dictation stopped without text. */
function speechProblem(code: string | undefined): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Giv browseren adgang til mikrofonen for at tale til Assist.";
    case "no-speech":
      return "Jeg hørte ikke noget. Prøv igen.";
    case "audio-capture":
      return "Der er ingen mikrofon at lytte med.";
    case "network":
      return "Talegenkendelsen kræver forbindelse til nettet.";
    default:
      return "Talegenkendelsen stoppede. Prøv igen, eller skriv i stedet.";
  }
}

/**
 * Danish voice input via the Web Speech API. `supported` is false when the browser has none.
 * `interim` is what has been heard so far while talking; `problem` explains why it stopped without text.
 */
export function useSpeech(onText: (text: string) => void) {
  const ctor = typeof window === "undefined" ? null : speechRecognitionCtor(window);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
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
    recognition.interimResults = true;
    recognition.continuous = false;
    let final = "";
    recognition.onresult = (event) => {
      const results = Array.from(event.results) as (ArrayLike<{ transcript: string }> & { isFinal?: boolean })[];
      final = results
        .filter((result) => result.isFinal !== false)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      setInterim(results.map((result) => result[0]?.transcript ?? "").join(" ").trim());
    };
    let failure: string | undefined;
    recognition.onerror = (event?: { error?: string }) => {
      failure = event?.error ?? "unknown";
    };
    recognition.onend = () => {
      active.current = null;
      setListening(false);
      setInterim("");
      if (final) handler.current(final);
      else if (failure && failure !== "aborted") setProblem(speechProblem(failure));
    };
    active.current = recognition;
    setProblem(null);
    setListening(true);
    try {
      recognition.start();
    } catch {
      active.current = null;
      setListening(false);
      setProblem(speechProblem(undefined));
    }
  }, [ctor]);

  return { supported: ctor !== null, listening, interim, problem, toggle };
}
