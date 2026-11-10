export type DetectedTimer = { seconds: number; label: string };

const UNIT_SECONDS: Record<string, number> = {
  sekund: 1,
  sekunder: 1,
  sek: 1,
  minut: 60,
  minutter: 60,
  min: 60,
  time: 3600,
  timer: 3600,
};

const AMOUNT = "\\d+(?:[.,]\\d+)?";
// "15 minutter", "i 35 min.", "35–40 minutter", "1,5 time". The unit must not continue into a longer word.
const DURATION = new RegExp(
  `(${AMOUNT})(?:\\s*(?:[–-]|til)\\s*(${AMOUNT}))?\\s*(minutter|minut|min|timer|time|sekunder|sekund|sek)(?![\\p{L}])`,
  "iu",
);
const EXTRA_MINUTES = /^\s*(?:og\s+)?(\d+)\s*(?:minutter|minut|min)(?![\p{L}])/iu;
const WORD_DURATIONS: readonly [RegExp, number][] = [
  [/\ben halv time\b/iu, 30 * 60],
  [/\bhalvanden time\b/iu, 90 * 60],
  [/\bet kvarter\b/iu, 15 * 60],
];

const toNumber = (value: string): number => Number(value.replace(",", "."));

/** 45 -> "45 sek", 900 -> "15 min", 5400 -> "1 t 30 min", 900 -> "15 min", 45 -> "45 sek". */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) return `${total} sek`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} t` : `${hours} t ${minutes} min`;
}

/** "12:05" / "1:02:03" for a running clock. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * Finds the first duration in a Danish recipe step. Ranges use the lower bound ("35–40 minutter" -> 35 min)
 * so the cook checks in time. Returns undefined when the step has no timeable duration.
 */
export function detectTimer(text: string): DetectedTimer | undefined {
  const match = DURATION.exec(text);
  const word = WORD_DURATIONS.flatMap(([pattern, seconds]) => {
    const found = pattern.exec(text);
    return found ? [{ at: found.index, seconds }] : [];
  })[0];
  if (word && (!match || word.at < match.index)) {
    return { seconds: word.seconds, label: formatDuration(word.seconds) };
  }
  if (!match) return undefined;
  const amount = toNumber(match[1] ?? "");
  const perUnit = UNIT_SECONDS[(match[3] ?? "").toLocaleLowerCase("da-DK")];
  if (!Number.isFinite(amount) || amount <= 0 || perUnit === undefined) return undefined;
  let seconds = amount * perUnit;
  if (perUnit === 3600) {
    const extra = EXTRA_MINUTES.exec(text.slice(match.index + match[0].length));
    if (extra) seconds += Number(extra[1]) * 60;
  }
  seconds = Math.round(seconds);
  return { seconds, label: formatDuration(seconds) };
}
