import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

const root = new URL("../../", import.meta.url);
const json = (path: string): { version: string } => JSON.parse(readFileSync(new URL(path, root), "utf8"));

describe("one version everywhere", () => {
  it("keeps config.yaml, every package.json and the server's reported version equal", () => {
    const yaml = /^version:\s*"([^"]+)"/mu.exec(readFileSync(new URL("madplan/config.yaml", root), "utf8"))?.[1];
    expect(yaml).toMatch(/^\d+\.\d+\.\d+$/u);
    for (const path of ["package.json", "domain/package.json", "server/package.json", "web/package.json"]) {
      expect(json(path).version, path).toBe(yaml);
    }
    expect(loadConfig({}, "./none.json").version).toBe(yaml);
  });
});
