import { describe, expect, it } from "vitest";
import { LOCAL_DOCKERFILE, localConfig } from "../../scripts/bundle-local.ts";

describe("bundle-local", () => {
  it("removes the registry image from the add-on config", () => {
    const yaml = 'name: "Madplan"\nimage: "ghcr.io/clausjuul/ha-madplan-{arch}"\nslug: "madplan"\n';
    expect(localConfig(yaml)).toBe('name: "Madplan"\nslug: "madplan"\n');
    expect(localConfig(yaml)).not.toContain("image:");
  });

  it("builds the server from copied sources", () => {
    expect(LOCAL_DOCKERFILE).toContain('CMD ["node", "server/src/main.ts"]');
    expect(LOCAL_DOCKERFILE).toContain("COPY web/dist web/dist");
  });
});
