import { describe, expect, it } from "vitest";
import { themeTokens } from "../src/lib/ha-theme";

const reader = (vars: Record<string, string>) => (name: string) => vars[name] ?? "";

describe("themeTokens", () => {
  const probe = document.createElement("span");
  document.body.append(probe);

  it("maps HA's light theme onto the app tokens", () => {
    const { tokens, dark } = themeTokens(
      reader({
        "--primary-background-color": "#fafafa",
        "--card-background-color": "#ffffff",
        "--secondary-background-color": "#e5e5e5",
        "--primary-text-color": "#212121",
        "--secondary-text-color": "#727272",
        "--divider-color": "rgba(0, 0, 0, 0.12)",
        "--primary-color": "#03a9f4",
        "--text-primary-color": "#ffffff",
        "--warning-color": "#ffa600",
      }),
      probe,
    );
    expect(dark).toBe(false);
    expect(tokens["--c-ground"]).toBe("#fafafa");
    expect(tokens["--c-surface"]).toBe("#ffffff");
    expect(tokens["--c-accent"]).toBe("#03a9f4");
    expect(tokens["--c-on-accent"]).toBe("#ffffff");
    expect(tokens["--c-on-offer"]).toBe("#101114");
    expect(tokens["--c-line"]).toBe("rgba(0, 0, 0, 0.12)");
    // HA's own defaults when the theme leaves shape unset.
    expect(tokens["--c-radius"]).toBe("12px");
    expect(tokens["--c-card-border-width"]).toBe("1px");
  });

  it("detects dark themes and honours card shape overrides", () => {
    const { tokens, dark } = themeTokens(
      reader({
        "--primary-background-color": "#111111",
        "--ha-card-background": "#1c1c1c",
        "--card-background-color": "#202020",
        "--ha-card-border-radius": "0px",
        "--ha-card-border-width": "0px",
      }),
      probe,
    );
    expect(dark).toBe(true);
    expect(tokens["--c-surface"]).toBe("#1c1c1c");
    expect(tokens["--c-radius"]).toBe("0px");
    expect(tokens["--c-card-border-width"]).toBe("0px");
    expect(tokens["--c-accent"]).toBe("");
  });
});
