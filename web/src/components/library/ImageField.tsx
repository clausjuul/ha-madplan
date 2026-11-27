import { useRef, useState } from "react";
import { ImagePlus, Link2, RefreshCw, Trash2 } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { downscaleImage } from "@/lib/image-resize";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** A bundled photo shown while no own image is set; it can be replaced but not removed. */
  fallback?: string;
};

/**
 * The dish photo at the top of the form: shown large when there is one, otherwise a tile to upload one
 * (with a link field as the alternative). Uploads are downscaled in the browser and sent as a data URL.
 */
export function ImageField({ value, onChange, fallback }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  const [byLink, setByLink] = useState(false);
  const [broken, setBroken] = useState(false);

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setBusy(true);
    setProblem(undefined);
    try {
      onChange(await downscaleImage(file));
      setBroken(false);
      setByLink(false);
    } catch {
      setProblem("Billedet kunne ikke bruges. Prøv et andet (JPEG eller PNG).");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const pick = (): void => fileRef.current?.click();
  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      className="sr-only"
      tabIndex={-1}
      aria-label="Vælg billede fra enhed"
      onChange={(event) => void onFile(event.target.files?.[0])}
    />
  );
  const overlayButton = "flex h-11 items-center gap-1.5 rounded-full bg-ground/85 px-4 text-sm font-semibold text-ink backdrop-blur hover:bg-ground";

  const shown = value || fallback;
  if (shown && !byLink) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-ground">
        {broken ? (
          <div className="flex aspect-[16/9] items-center justify-center p-6 text-center text-sm text-muted">Billedet kunne ikke vises. Tjek linket, eller vælg et andet.</div>
        ) : (
          <img src={shown} alt="Billede af retten" onError={() => setBroken(true)} className="aspect-[16/9] w-full object-cover" />
        )}
        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 p-2">
          <button type="button" onClick={pick} disabled={busy} className={overlayButton}>
            <RefreshCw size={15} aria-hidden="true" />
            {busy ? "Behandler…" : "Skift billede"}
          </button>
          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setBroken(false);
              }}
              aria-label="Fjern billede"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-ground/85 text-ink backdrop-blur hover:text-danger"
            >
              <Trash2 size={17} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {fileInput}
        {problem ? <p className="m-0 bg-ground px-3 py-2 text-[13px] text-danger">{problem}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-14 items-center gap-1 rounded-2xl border border-dashed border-line bg-ground pr-1">
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-2xl pl-4 text-left text-[15px] font-semibold text-ink-2 hover:text-ink disabled:opacity-60"
        >
          <ImagePlus size={20} aria-hidden="true" className="shrink-0 text-accent" />
          {busy ? "Behandler billede…" : "Tilføj billede"}
        </button>
        <button
          type="button"
          onClick={() => setByLink((current) => !current)}
          aria-expanded={byLink}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-ink-2 hover:bg-raised hover:text-ink"
        >
          <Link2 size={15} aria-hidden="true" />
          Brug link
        </button>
      </div>
      {fileInput}
      {byLink ? (
        <Field label="Billede (link)" error={problem}>
          <input
            type="url"
            inputMode="url"
            autoFocus
            value={value}
            onChange={(event) => {
              setBroken(false);
              onChange(event.target.value);
            }}
            onBlur={() => {
              if (value.trim()) setByLink(false);
            }}
            placeholder="https://…"
            className={inputClass}
          />
        </Field>
      ) : problem ? (
        <p className="m-0 text-[13px] text-danger">{problem}</p>
      ) : null}
    </div>
  );
}
