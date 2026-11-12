/** The only place that talks to OpenAI. Everything else depends on the OpenAiClient interface, so tests use a fake. */

export type AiRequest = {
  model: string;
  /** Our own rules (system part). Never put untrusted text here. */
  instructions: string;
  /** The user part: untrusted data blocks and the concrete question. */
  input: string;
  /** Let the model search the web (required for discovery). */
  webSearch?: boolean;
  maxOutputTokens?: number;
  /** Ask for a single JSON object (Responses API json_object mode). The prompt must mention JSON. */
  json?: boolean;
  /** Structured output: the answer must match this JSON schema (strict). Takes precedence over `json`. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  signal?: AbortSignal;
  /** Streams the answer: called with each new piece of output text as it arrives. */
  onText?: (delta: string) => void;
};

export type AiResponse = { text: string; usedWebSearch: boolean };

export type OpenAiClient = {
  /** True when an API key is configured. */
  readonly configured: boolean;
  respond(request: AiRequest): Promise<AiResponse>;
};

/** Failure with a Danish message that is safe to show to the user. */
export class AiError extends Error {}

export const noOpenAi: OpenAiClient = {
  configured: false,
  respond: () => Promise.reject(new AiError("OpenAI er ikke sat op.")),
};

type OutputItem = { type?: string; content?: { type?: string; text?: string }[] };

export function createOpenAiClient(apiKey: string, fetcher: typeof fetch = fetch): OpenAiClient {
  if (!apiKey) return noOpenAi;
  return {
    configured: true,
    async respond(request) {
      let response: Response;
      try {
        response = await fetcher("https://api.openai.com/v1/responses", {
          method: "POST",
          signal: request.signal,
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: request.model,
            instructions: request.instructions,
            // json_object mode requires the word "json" in the input messages; instructions do not count.
            input: request.json || request.jsonSchema ? `${request.input}\n\nSvar med ét JSON-objekt (json).` : request.input,
            store: false,
            ...(request.onText ? { stream: true } : {}),
            ...(request.maxOutputTokens ? { max_output_tokens: request.maxOutputTokens } : {}),
            ...(request.jsonSchema
              ? { text: { format: { type: "json_schema", name: request.jsonSchema.name, schema: request.jsonSchema.schema, strict: true } } }
              : request.json
                ? { text: { format: { type: "json_object" } } }
                : {}),
            ...(request.webSearch
              ? { tools: [{ type: "web_search" }], tool_choice: "required" }
              : {}),
          }),
        });
      } catch {
        throw new AiError("AI-tjenesten kunne ikke kontaktes.");
      }
      if (request.onText && response.ok && response.body) return readStream(response.body, request.onText);
      const body = (await response.json().catch(() => ({}))) as {
        output?: OutputItem[];
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new AiError(`AI-tjenesten afviste forespørgslen (${body.error?.message ?? response.status}).`);
      }
      const output = body.output ?? [];
      const text = output
        .flatMap((item) =>
          item.type === "message"
            ? (item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text ?? "")
            : [],
        )
        .join("\n");
      return { text, usedWebSearch: output.some((item) => item.type === "web_search_call") };
    },
  };
}

type StreamEvent = {
  type?: string;
  delta?: string;
  item?: { type?: string };
  response?: { error?: { message?: string } };
  message?: string;
};

/** Reads a Responses API server-sent event stream; the text is the concatenated output_text deltas. */
async function readStream(body: ReadableStream<Uint8Array>, onText: (delta: string) => void): Promise<AiResponse> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let pending = "";
  let text = "";
  let usedWebSearch = false;
  const handle = (line: string): void => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let event: StreamEvent;
    try {
      event = JSON.parse(data) as StreamEvent;
    } catch {
      return;
    }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      text += event.delta;
      onText(event.delta);
    } else if (event.type === "response.output_item.added" && event.item?.type === "web_search_call") {
      usedWebSearch = true;
    } else if (event.type === "response.failed" || event.type === "error") {
      throw new AiError(`AI-tjenesten afviste forespørgslen (${event.response?.error?.message ?? event.message ?? "fejl"}).`);
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      lines.forEach(handle);
    }
    handle(pending);
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError("Forbindelsen til AI-tjenesten blev afbrudt.");
  }
  return { text, usedWebSearch };
}

/** Extracts the outermost JSON object from a model answer (models sometimes wrap it in prose or fences). */
export function extractJsonObject(answer: string): unknown {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start < 0 || end < start) return undefined;
  try {
    return JSON.parse(answer.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
