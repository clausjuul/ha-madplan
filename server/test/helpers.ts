import { createApp } from "../src/app.ts";
import { AiError, noOpenAi } from "../src/ai/openai.ts";
import type { AiRequest, AiResponse, OpenAiClient } from "../src/ai/openai.ts";
import { loadConfig } from "../src/config.ts";
import type { Config } from "../src/config.ts";
import { openDatabase } from "../src/db.ts";
import { Jobs } from "../src/deps.ts";
import type { Deps } from "../src/deps.ts";
import { Repo } from "../src/repo.ts";

/** Monday 9 November 2026, noon in Copenhagen (11:00 UTC), independent of the machine's own zone. */
export const NOW = new Date(Date.UTC(2026, 10, 9, 11, 0, 0));
export const TODAY = "2026-11-09";

type Answer = string | AiError | AiResponse;
export type FakeAi = OpenAiClient & {
  calls: AiRequest[];
  /** Queues the answer to the next call. */
  next: (answer: Answer) => void;
  /** Queues an answer that is only given once the returned function is called. */
  hold: (answer: Answer) => () => void;
};

export function fakeAi(): FakeAi {
  const queue: Promise<Answer>[] = [];
  const calls: AiRequest[] = [];
  return {
    configured: true,
    calls,
    next: (answer) => void queue.push(Promise.resolve(answer)),
    hold(answer) {
      let release = (): void => undefined;
      queue.push(new Promise<Answer>((resolve) => (release = () => resolve(answer))));
      return () => release();
    },
    async respond(request) {
      calls.push(request);
      const answer = await queue.shift();
      if (answer === undefined) throw new AiError("Ingen svar i testen.");
      if (answer instanceof AiError) throw answer;
      return typeof answer === "string" ? { text: answer, usedWebSearch: true } : answer;
    },
  };
}

export type TestOptions = {
  openai?: OpenAiClient;
  fetch?: typeof fetch;
  env?: Record<string, string>;
  config?: Partial<Config>;
  now?: Date;
  /** Reuse an existing repo (simulates a server restart on the same database). */
  repo?: Repo;
};

export function setup(options: TestOptions = {}) {
  const config: Config = {
    ...loadConfig({ MADPLAN_ALLOW_ANY_ORIGIN: "1", TZ: "Europe/Copenhagen", MADPLAN_WEB_DIR: "./does-not-exist", ...options.env }, "./no-options.json"),
    ...options.config,
  };
  const repo = options.repo ?? new Repo(openDatabase(":memory:"));
  const deps: Deps = {
    repo,
    config,
    openai: options.openai ?? noOpenAi,
    fetch: options.fetch ?? (() => Promise.reject(new Error("Ingen netværk i tests"))),
    now: () => options.now ?? NOW,
    jobs: new Jobs(),
  };
  const app = createApp(deps, { pingMs: 40 });

  async function call(method: string, path: string, body?: unknown): Promise<Response> {
    return app.request(`http://localhost/api/${path}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function json<T = unknown>(method: string, path: string, body?: unknown, status = 200): Promise<T> {
    const response = await call(method, path, body);
    const text = await response.text();
    if (response.status !== status) throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
    return (text ? JSON.parse(text) : undefined) as T;
  }
  return { app, deps, repo, call, json };
}

export type Setup = ReturnType<typeof setup>;
export type { AiResponse };
