import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFakeClient } from "../src/api/fake-client";
import { ApiProvider } from "../src/api/provider";
import { ChipInput } from "../src/components/ui/ChipInput";
import { ImportV1Panel } from "../src/components/settings/ImportV1Panel";
import { previewV1 } from "../src/lib/v1-import";

const fixture = readFileSync(resolve(process.cwd(), "e2e/fixtures/v1.json"), "utf8");

function Harness() {
  const [values, setValues] = useState<string[]>([]);
  return (
    <>
      <ChipInput label="Undgå" values={values} onChange={setValues} />
      <output data-testid="values">{values.join("|")}</output>
    </>
  );
}

describe("ChipInput", () => {
  it("commits on Enter and on comma, splits pasted lists and removes on click", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Undgå");
    fireEvent.change(input, { target: { value: "skaldyr" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "koriander, svampe," } });
    expect(screen.getByTestId("values")).toHaveTextContent("skaldyr|koriander|svampe");
    fireEvent.click(screen.getByRole("button", { name: "Fjern koriander" }));
    expect(screen.getByTestId("values")).toHaveTextContent("skaldyr|svampe");
  });
});

describe("v1 import preview", () => {
  it("previews counts and warnings client side, and rejects non-v1 files", () => {
    const preview = previewV1(fixture, "2026-11-09T10:00:00.000Z");
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.counts.profiles).toBe(2);
      expect(preview.counts.meals).toBe(4); // 2 planned + 2 eaten from history
      expect(preview.counts.dishes).toBe(1); // only custom dishes are stored; the catalog is built in
    }
    expect(previewV1("{nope").ok).toBe(false);
    expect(previewV1(JSON.stringify({ version: 2 }))).toMatchObject({ ok: false });
  });

  it("walks choose -> preview -> confirm -> result", async () => {
    const client = createFakeClient({ today: "2026-11-09", empty: true });
    render(
      <ApiProvider client={client}>
        <QueryClientProvider client={new QueryClient()}>
          <ImportV1Panel canImport />
        </QueryClientProvider>
      </ApiProvider>,
    );
    const file = new File([fixture], "meal-planner.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Vælg v1-fil"), { target: { files: [file] } });
    expect(await screen.findByText("Personer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Importér" }));
    expect(await screen.findByText(/Importeret: 4 dage/u)).toBeInTheDocument();
    await waitFor(async () => expect((await client.bootstrap()).isEmpty).toBe(false));
  });

  it("is disabled with an explanation when the database is not empty", () => {
    const client = createFakeClient({ today: "2026-11-09" });
    render(
      <ApiProvider client={client}>
        <QueryClientProvider client={new QueryClient()}>
          <ImportV1Panel canImport={false} />
        </QueryClientProvider>
      </ApiProvider>,
    );
    expect(screen.getByText(/kun mulig, mens madplanen er tom/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vælg fil" })).toBeDisabled();
  });
});
