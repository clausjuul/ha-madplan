import type { Config } from "./config.ts";
import type { OpenAiClient } from "./ai/openai.ts";
import type { Repo } from "./repo.ts";

/** Tracks fire-and-forget work so tests (and shutdown) can wait for it. */
export class Jobs {
  private pending = new Set<Promise<unknown>>();

  start(work: Promise<unknown>): void {
    const tracked = work.catch((error: unknown) => console.error("background job failed", error));
    this.pending.add(tracked);
    void tracked.finally(() => this.pending.delete(tracked));
  }

  async settled(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }
}

/** Everything the request handlers need; tests replace the clock, the network and OpenAI. */
export type Deps = {
  repo: Repo;
  config: Config;
  openai: OpenAiClient;
  fetch: typeof fetch;
  now: () => Date;
  jobs: Jobs;
};
