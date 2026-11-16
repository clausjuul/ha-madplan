/**
 * Follow the Home Assistant theme when the app runs inside HA (Ingress iframe, same origin).
 *
 * HA keeps its theme as CSS variables on the parent document's <html>. Variables do not
 * cascade into an iframe, so we read the resolved values and write them onto our own
 * root as the app's tokens (see index.css). Outside HA nothing is written and the
 * app keeps its own dark palette.
 */

type Read = (name: string) => string;

const first = (read: Read, ...names: string[]): string => {
  for (const name of names) {
    const value = read(name);
    if (value) return value;
  }
  return "";
};

const mix = (color: string, percent: number, base = "transparent"): string =>
  `color-mix(in srgb, ${color} ${percent}%, ${base})`;

/** Relative luminance (0–1) of any CSS colour, or null when it cannot be parsed. */
function luminance(color: string, probe: HTMLElement): number | null {
  probe.style.color = "";
  probe.style.color = color;
  if (!probe.style.color) return null;
  const match = getComputedStyle(probe).color.match(/[\d.]+/g);
  if (!match || match.length < 3) return null;
  const [r = 0, g = 0, b = 0] = match.slice(0, 3).map((part) => {
    const c = Number(part) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white text, whichever reads best on `color`. */
function onColor(color: string, probe: HTMLElement): string {
  const lum = luminance(color, probe);
  if (lum === null) return "";
  return lum > 0.4 ? "#101114" : "#ffffff";
}

/** The app's tokens derived from HA's theme variables. Empty values are left at the CSS default. */
export function themeTokens(read: Read, probe: HTMLElement): { tokens: Record<string, string>; dark: boolean } {
  const ground = first(read, "--primary-background-color");
  const surface = first(read, "--ha-card-background", "--card-background-color");
  const raised = first(read, "--secondary-background-color");
  const text = first(read, "--primary-text-color");
  const muted = first(read, "--secondary-text-color");
  const divider = first(read, "--divider-color");
  const accent = first(read, "--primary-color");
  const newColor = first(read, "--purple-color", "--accent-color");
  const offer = first(read, "--warning-color", "--orange-color");
  const ok = first(read, "--success-color", "--green-color");
  const danger = first(read, "--error-color", "--red-color");

  const groundLum = ground ? luminance(ground, probe) : null;
  const dark = groundLum === null ? true : groundLum < 0.4;

  const tokens: Record<string, string> = {
    "--c-ground": ground,
    "--c-surface": surface,
    "--c-raised": raised,
    "--c-hairline": divider ? mix(divider, 60) : "",
    "--c-line": divider,
    "--c-text": text,
    "--c-text-2": text && muted ? mix(text, 55, muted) : "",
    "--c-muted": muted,
    "--c-accent": accent,
    "--c-on-accent": accent ? first(read, "--text-primary-color") || onColor(accent, probe) : "",
    "--c-accent-soft": accent ? mix(accent, dark ? 14 : 12) : "",
    "--c-new": newColor,
    "--c-on-new": newColor ? onColor(newColor, probe) : "",
    "--c-offer": offer,
    "--c-on-offer": offer ? onColor(offer, probe) : "",
    "--c-offer-soft": offer ? mix(offer, 16) : "",
    "--c-ok": ok,
    "--c-danger": danger,
    "--c-scrim": ground ? mix(ground, 72) : "",

    // Shape and spacing. HA's own fallbacks apply when the theme leaves them unset.
    "--c-radius": first(read, "--ha-card-border-radius", "--ha-border-radius-lg") || "12px",
    "--c-card-border-width": first(read, "--ha-card-border-width") || "1px",
    "--c-card-border-color": first(read, "--ha-card-border-color", "--divider-color"),
    "--c-card-shadow": first(read, "--ha-card-box-shadow") || "none",
    "--c-space": first(read, "--ha-space-1"),
    "--c-font": first(read, "--ha-font-family-body", "--primary-font-family", "--mdc-typography-font-family"),
  };
  return { tokens, dark };
}

/** The parent HA document when we are framed by it on the same origin. */
function haDocument(): Document | null {
  try {
    if (window.parent === window) return null;
    const doc = window.parent.document;
    // Only HA's frontend defines these; any other framing page is ignored.
    const style = getComputedStyle(doc.documentElement);
    return style.getPropertyValue("--primary-color").trim() || doc.querySelector("home-assistant") ? doc : null;
  } catch {
    return null; // cross-origin
  }
}

/** Start following the HA theme. Returns a cleanup function. */
export function followHaTheme(): () => void {
  const parent = haDocument();
  if (!parent) return () => {};
  const root = document.documentElement;
  const probe = document.createElement("span");
  probe.hidden = true;
  document.body.append(probe);
  const applied = new Set<string>();

  const apply = (): void => {
    const style = getComputedStyle(parent.documentElement);
    const { tokens, dark } = themeTokens((name) => style.getPropertyValue(name).trim(), probe);
    for (const [name, value] of Object.entries(tokens)) {
      if (value) {
        root.style.setProperty(name, value);
        applied.add(name);
      } else if (applied.has(name)) {
        root.style.removeProperty(name);
        applied.delete(name);
      }
    }
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.ha = "";
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta && tokens["--c-ground"]) meta.content = tokens["--c-ground"];
  };

  let frame = 0;
  const schedule = (): void => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  };

  apply();
  // HA rewrites the inline style on <html> whenever the theme or dark mode changes.
  const observer = new MutationObserver(schedule);
  observer.observe(parent.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
  observer.observe(parent.head, { childList: true });
  const media = window.parent.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", schedule);

  return () => {
    observer.disconnect();
    media.removeEventListener("change", schedule);
    cancelAnimationFrame(frame);
    probe.remove();
  };
}
