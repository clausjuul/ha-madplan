import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, FileText, Link2, Trash2 } from "lucide-react";
import type { DishPreview, DishReadInput } from "@madplan/domain";
import { errorMessage, useDishActions } from "@/api/library-mutations";
import { Field, inputClass } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { downscaleImage, RECIPE_PHOTO } from "@/lib/image-resize";

type Source = "link" | "text" | "photo";

type Props = {
  open: boolean;
  /** OpenAI is set up: text and photos can be read, and links without structured data too. */
  aiAvailable: boolean;
  onClose: () => void;
  /** The recipe was read; the caller opens it in the form so it can be checked and saved. */
  onPreview: (preview: DishPreview) => void;
};

export const MAX_PHOTOS = 3;

const SOURCES: { key: Source; label: string; icon: typeof Link2 }[] = [
  { key: "link", label: "Link", icon: Link2 },
  { key: "text", label: "Tekst", icon: FileText },
  { key: "photo", label: "Foto", icon: Camera },
];

const BUSY: Record<Source, string> = {
  link: "Henter og tjekker opskriften…",
  text: "Læser opskriften…",
  photo: "Læser billederne…",
};

/** Reads a recipe from a link, pasted text or photos into a preview. Nothing is saved here. */
export function AddRecipeSheet({ open, aiAvailable, onClose, onPreview }: Props) {
  const actions = useDishActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source>("link");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    setSource("link");
    setUrl("");
    setText("");
    setPhotos([]);
    setError(undefined);
  }, [open]);

  const choose = (next: Source): void => {
    setSource(next);
    setError(undefined);
  };

  const addPhotos = async (files: FileList | null): Promise<void> => {
    if (!files?.length) return;
    setError(undefined);
    const room = MAX_PHOTOS - photos.length;
    const picked = [...files].slice(0, room);
    try {
      const scaled = await Promise.all(picked.map((file) => downscaleImage(file, undefined, RECIPE_PHOTO)));
      setPhotos((current) => [...current, ...scaled].slice(0, MAX_PHOTOS));
      if (files.length > room) setError(`Højst ${MAX_PHOTOS} billeder pr. opskrift.`);
    } catch {
      setError("Et af billederne kunne ikke bruges. Prøv et andet (JPEG eller PNG).");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const input = (): DishReadInput | string => {
    if (source === "link") {
      return /^https?:\/\/\S+$/iu.test(url.trim()) ? { url: url.trim() } : "Indsæt et link, der starter med http:// eller https://.";
    }
    if (source === "text") return text.trim().length >= 20 ? { text: text.trim() } : "Indsæt hele opskriften med ingredienser.";
    return photos.length > 0 ? { images: photos } : "Tag eller vælg et billede af opskriften.";
  };

  const read = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const request = input();
    if (typeof request === "string") {
      setError(request);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      onPreview(await actions.read(request));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const subtitle =
    source === "link"
      ? aiAvailable
        ? "Virker med de fleste opskriftssider"
        : "Virker med sider, der har struktureret opskriftsdata"
      : source === "text"
        ? "Fx kopieret fra en hjemmeside, en besked eller en mail"
        : "Fx en side i en kogebog eller en håndskrevet opskrift";

  return (
    <Sheet open={open} onClose={onClose} title="Tilføj opskrift" subtitle={subtitle}>
      <form onSubmit={(event) => void read(event)} noValidate className="flex flex-col gap-4 px-3 pb-2">
        <div role="radiogroup" aria-label="Hvor kommer opskriften fra?" className="grid grid-cols-3 gap-1 rounded-full bg-ground p-1">
          {SOURCES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={source === key}
              onClick={() => choose(key)}
              className={`flex h-11 items-center justify-center gap-1.5 rounded-full text-[15px] ${
                source === key ? "bg-surface font-semibold text-ink shadow-sm" : "text-ink-2 hover:text-ink"
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {source !== "link" && !aiAvailable ? (
          <p className="m-0 rounded-2xl bg-ground p-4 text-[15px] text-ink-2">
            Det kræver en OpenAI-nøgle under appens indstillinger i Home Assistant. Uden den kan du hente opskrifter fra et link eller oprette dem selv.
          </p>
        ) : source === "link" ? (
          <Field label="Link til opskrift" error={error}>
            <input type="url" inputMode="url" autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" className={inputClass} />
          </Field>
        ) : source === "text" ? (
          <Field label="Opskriftens tekst" error={error} hint="Navn, ingredienser og gerne fremgangsmåde. Formatet er ligegyldigt.">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={9}
              maxLength={30_000}
              className={`${inputClass} h-auto min-h-[200px] py-3 leading-relaxed`}
            />
          </Field>
        ) : (
          <div className="flex flex-col gap-2">
            {photos.length > 0 ? (
              <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
                {photos.map((photo, index) => (
                  <li key={photo.slice(-40)} className="relative">
                    <img src={photo} alt={`Billede ${index + 1} af opskriften`} className="aspect-[3/4] w-full rounded-2xl object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((current) => current.filter((_, at) => at !== index))}
                      aria-label={`Fjern billede ${index + 1}`}
                      className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-surface/90 text-ink hover:text-danger"
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {photos.length < MAX_PHOTOS ? (
              <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-dashed border-line px-5 text-[15px] font-semibold text-ink hover:bg-raised">
                <Camera size={18} aria-hidden="true" />
                {photos.length ? "Tilføj et billede mere" : "Tag eller vælg billede"}
                <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(event) => void addPhotos(event.target.files)} />
              </label>
            ) : null}
            <p className={`m-0 text-[13px] ${error ? "text-danger" : "text-muted"}`} role={error ? "alert" : undefined}>
              {error ?? `Fylder opskriften flere sider, så tag op til ${MAX_PHOTOS} billeder. Sørg for, at hele ingredienslisten er skarp.`}
            </p>
          </div>
        )}

        {source !== "link" && !aiAvailable ? null : (
          <button type="submit" disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent disabled:opacity-60">
            {busy ? BUSY[source] : "Læs opskriften"}
          </button>
        )}
        <p className="m-0 text-center text-[13px] text-muted">Du ser opskriften igennem, før den bliver gemt.</p>
      </form>
    </Sheet>
  );
}
