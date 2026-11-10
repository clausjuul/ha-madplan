import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import type { ImportResult } from "@madplan/domain";
import { useApi } from "@/api/provider";
import { queryKeys } from "@/api/queries";
import { errorMessage } from "@/api/library-mutations";
import { plural } from "@/lib/library";
import { previewV1, type V1Preview } from "@/lib/v1-import";

function Warnings({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="m-0 max-h-48 list-disc overflow-y-auto rounded-2xl bg-offer-soft py-3 pl-8 pr-4 text-sm leading-relaxed text-offer">
      {items.map((warning, index) => (
        <li key={`${index}-${warning}`}>{warning}</li>
      ))}
    </ul>
  );
}

/** Import from the old Meal Planner: choose file, preview counts client side, confirm, show server warnings. */
export function ImportV1Panel({ canImport }: { canImport: boolean }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<V1Preview | undefined>();
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ImportResult | undefined>();

  const choose = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setResult(undefined);
    setError(undefined);
    setFileName(file.name);
    setPreview(previewV1(await file.text()));
  };

  const confirm = async (): Promise<void> => {
    if (!preview?.ok) return;
    setBusy(true);
    setError(undefined);
    try {
      setResult(await api.importV1(preview.json));
      setPreview(undefined);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap });
      void queryClient.invalidateQueries({ queryKey: queryKeys.shopping });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-raised p-4">
      <div>
        <h3 className="font-display m-0 text-lg font-bold">Importér fra den gamle Meal Planner</h3>
        <p className="mb-0 mt-1 text-[15px] leading-relaxed text-ink-2">
          Vælg en JSON-eksport fra den gamle app. Du ser først, hvad der kommer med, inden noget gemmes.
        </p>
      </div>
      {canImport ? null : (
        <p role="note" className="m-0 rounded-2xl bg-ground p-3 text-sm leading-relaxed text-ink-2">
          Import er kun mulig, mens madplanen er tom, så ingen eksisterende data overskrives. Eksportér og gem en kopi,
          hvis du vil starte forfra.
        </p>
      )}
      <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Vælg v1-fil" disabled={!canImport} onChange={(event) => void choose(event.target.files?.[0])} />
      <button type="button" disabled={!canImport} onClick={() => fileRef.current?.click()} className="flex h-12 w-fit items-center gap-2 rounded-full border border-line px-5 text-[15px] font-semibold text-ink enabled:hover:bg-ground disabled:opacity-50">
        <FileUp size={18} aria-hidden="true" />
        Vælg fil
      </button>

      {preview && !preview.ok ? (
        <p role="alert" className="m-0 text-[15px] text-danger">
          {preview.error}
        </p>
      ) : null}
      {preview?.ok ? (
        <div className="flex flex-col gap-3" aria-label="Forhåndsvisning af import">
          <p className="m-0 text-sm text-muted">{fileName}</p>
          <dl className="m-0 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["Dage med retter", preview.counts.meals],
                ["Retter", preview.counts.dishes],
                ["Personer", preview.counts.profiles],
                ["Gemte idéer", preview.counts.saved],
              ] as const
            ).map(([label, count]) => (
              <div key={label} className="rounded-2xl bg-ground p-3">
                <dd className="font-display m-0 text-2xl font-bold">{count}</dd>
                <dt className="text-[13px] text-muted">{label}</dt>
              </div>
            ))}
          </dl>
          <Warnings items={preview.warnings} />
          <button type="button" disabled={busy} onClick={() => void confirm()} className="h-12 w-fit rounded-full bg-accent px-6 text-[15px] font-semibold text-on-accent disabled:opacity-60">
            {busy ? "Importerer…" : "Importér"}
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-[15px] text-danger">
          {error}
        </p>
      ) : null}
      {result ? (
        <div role="status" className="flex flex-col gap-2">
          <p className="m-0 text-[15px] font-semibold text-ok">
            Importeret: {plural(result.counts.meals, "dag", "dage")}, {plural(result.counts.dishes, "ret", "retter")} og{" "}
            {plural(result.counts.profiles, "person", "personer")}.
          </p>
          <Warnings items={result.warnings} />
        </div>
      ) : null}
    </div>
  );
}
