const KEY = "madplan:reloaded-at";
/** A second failure within this window is shown instead of reloading again (no reload loops). */
const WINDOW_MS = 30_000;

/** Errors thrown when a lazy chunk from an older build is gone (the app was updated while the page was open). */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/iu.test(
    message,
  );
}

/** Reloads the page unless it already did so moments ago. Returns whether a reload was started. */
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false; // no storage: cannot guard against a loop, so do not reload
  }
  window.location.reload();
  return true;
}
