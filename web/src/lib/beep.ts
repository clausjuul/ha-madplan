let context: AudioContext | undefined;

/** Call from a user gesture (timer start) so the browser allows sound later. */
export function primeAudio(): void {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume();
  } catch {
    // Sound is a nicety; the timer still shows done.
  }
}

/** Three short beeps (Web Audio, no asset) plus a vibration where supported. */
export function alertTimerDone(): void {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  } catch {
    // Not supported.
  }
  try {
    primeAudio();
    if (!context) return;
    const audio = context;
    const start = audio.currentTime + 0.02;
    for (let i = 0; i < 3; i += 1) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const at = start + i * 0.35;
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.28);
    }
  } catch {
    // Ignore audio failures.
  }
}
