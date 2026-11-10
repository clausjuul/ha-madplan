import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { downscaleImage } from "@/lib/image-resize";

type Props = { value: string; onChange: (value: string) => void };

/** Image by link or upload; uploads are downscaled in the browser (max 1000x700 JPEG) and sent as a data URL. */
export function ImageField({ value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  const uploaded = value.startsWith("data:");

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setBusy(true);
    setProblem(undefined);
    try {
      onChange(await downscaleImage(file));
    } catch {
      setProblem("Billedet kunne ikke bruges. Prøv et andet (JPEG eller PNG).");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div className="flex items-center gap-3 rounded-2xl bg-ground p-2">
          <img src={value} alt="Billede af retten" className="h-16 w-24 rounded-xl object-cover" />
          <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{uploaded ? "Uploadet billede" : value}</span>
          <button type="button" onClick={() => onChange("")} aria-label="Fjern billede" className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-danger">
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {uploaded ? null : (
        <Field label="Billede (link)" error={problem}>
          <input
            type="url"
            inputMode="url"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="https://…"
            className={inputClass}
          />
        </Field>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Vælg billede fra enhed"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="flex h-12 items-center justify-center gap-2 rounded-full border border-line text-[15px] font-semibold text-ink hover:bg-raised disabled:opacity-60"
      >
        <ImagePlus size={18} aria-hidden="true" />
        {busy ? "Behandler billede…" : "Upload billede"}
      </button>
      {uploaded && problem ? <p className="m-0 text-[13px] text-danger">{problem}</p> : null}
    </div>
  );
}
