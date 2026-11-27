import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Camera, FileText, Link2, PenLine, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Dish, DishPreview, DishReadInput } from "@madplan/domain";
import { errorMessage, useDishActions } from "@/api/library-mutations";
import { Field, inputClass } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { dataUrlToBlob, downscaleImage, RECIPE_PHOTO } from "@/lib/image-resize";
import { DishForm } from "./DishForm";

type Props = {
  open: boolean;
  dishes: readonly Dish[];
  categories: readonly string[];
  /** OpenAI is set up: text and photos can be read, links without structured data too, and AI can fill in. */
  aiAvailable: boolean;
  onClose: () => void;
};

/** Where the user came from, for the back arrow. */
type Origin = "start" | "photos";
type Step =
  | { kind: "start" }
  | { kind: "photos" }
  | { kind: "reading"; from: Origin; message: string }
  | { kind: "form"; from: Origin; preview?: DishPreview };

export const MAX_PHOTOS = 3;

type Pasted = { kind: "empty" } | { kind: "url"; host: string } | { kind: "text"; lines: number };

/** A link (one http(s) address and nothing else) or recipe text. */
export function classifyPaste(value: string): Pasted {
  const trimmed = value.trim();
  if (!trimmed) return { kind: "empty" };
  if (/^https?:\/\/\S+$/iu.test(trimmed)) {
    try {
      return { kind: "url", host: new URL(trimmed).hostname.replace(/^www\./u, "") };
    } catch {
      // Falls through to text.
    }
  }
  return { kind: "text", lines: trimmed.split(/\n/u).filter((line) => line.trim()).length };
}

/**
 * "Tilføj ret" in one sheet: paste a link or the recipe text, take photos, or write it yourself;
 * a recipe that was read opens in the form to be checked before it is saved.
 */
export function AddDishSheet({ open, dishes, categories, aiAvailable, onClose }: Props) {
  const actions = useDishActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [step, setStep] = useState<Step>({ kind: "start" });
  const [pasted, setPasted] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [photoError, setPhotoError] = useState<string | undefined>();
  const [scaling, setScaling] = useState(false);

  useEffect(() => {
    if (!open) return;
    request.current += 1;
    setStep({ kind: "start" });
    setPasted("");
    setPhotos([]);
    setError(undefined);
    setPhotoError(undefined);
  }, [open]);

  const what = classifyPaste(pasted);

  const addPhotos = async (files: FileList | null): Promise<void> => {
    if (!files?.length) return;
    setPhotoError(undefined);
    setStep({ kind: "photos" });
    const room = MAX_PHOTOS - photos.length;
    const picked = [...files].slice(0, room);
    setScaling(true);
    try {
      const scaled = await Promise.all(picked.map((file) => downscaleImage(file, undefined, RECIPE_PHOTO)));
      setPhotos((current) => [...current, ...scaled].slice(0, MAX_PHOTOS));
      if (files.length > room) setPhotoError(`Højst ${MAX_PHOTOS} billeder pr. opskrift.`);
    } catch {
      setPhotoError("Et af billederne kunne ikke bruges. Prøv et andet (JPEG eller PNG).");
    } finally {
      setScaling(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const read = async (input: DishReadInput, from: Origin, message: string): Promise<void> => {
    const id = ++request.current;
    const fail = from === "start" ? setError : setPhotoError;
    fail(undefined);
    setStep({ kind: "reading", from, message });
    try {
      const preview = await withDishPhoto(await actions.read(input), "images" in input ? input.images : []);
      if (id === request.current) setStep({ kind: "form", from, preview });
    } catch (failure) {
      if (id !== request.current) return;
      fail(errorMessage(failure));
      setStep({ kind: from });
    }
  };

  const fetchPasted = (event: FormEvent): void => {
    event.preventDefault();
    if (what.kind === "empty") {
      setError(aiAvailable ? "Indsæt et link eller opskriftens tekst." : "Indsæt et link til en opskrift.");
    } else if (what.kind === "url") {
      void read({ url: pasted.trim() }, "start", `Henter opskriften fra ${what.host}…`);
    } else if (!aiAvailable) {
      setError("Det ligner ikke et link. Tekst kan kun læses med en OpenAI-nøgle.");
    } else if (pasted.trim().length < 3) {
      setError("Skriv lidt mere om retten.");
    } else {
      void read({ text: pasted.trim() }, "start", "Læser opskriften…");
    }
  };

  const back = (from: Origin): void => {
    request.current += 1;
    setStep({ kind: from });
  };

  let title = "Tilføj ret";
  let subtitle: string | undefined;
  let onBack: (() => void) | undefined;
  if (step.kind === "photos") {
    title = "Foto";
    onBack = () => back("start");
  } else if (step.kind === "reading") {
    onBack = () => back(step.from);
  } else if (step.kind === "form") {
    title = step.preview ? "Se opskriften igennem" : "Ny ret";
    subtitle = step.preview ? "Intet er gemt endnu" : undefined;
    onBack = () => back(step.from);
  }

  const photoInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      multiple
      className="sr-only"
      aria-label="Vælg billeder af opskriften"
      onChange={(event) => void addPhotos(event.target.files)}
    />
  );

  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle} onBack={onBack} tall={step.kind === "form"} fill={step.kind === "form"}>
      {step.kind === "form" ? (
        <div key="form" className="step-in flex min-h-0 flex-1 flex-col">
          <DishForm preview={step.preview} dishes={dishes} aiAvailable={aiAvailable} categories={categories} onClose={onClose} />
        </div>
      ) : step.kind === "reading" ? (
        <div key="reading" className="step-in flex flex-col items-center gap-5 px-3 pb-4 pt-6 text-center" role="status" aria-live="polite">
          <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-accent-soft">
            <Sparkles size={26} aria-hidden="true" className="text-accent" />
          </div>
          <div>
            <p className="m-0 text-[17px] font-semibold text-ink">{step.message}</p>
            <p className="m-0 mt-1 text-sm text-muted">Det tager som regel 10–30 sekunder.</p>
          </div>
          <div className="flex w-full flex-col gap-2" aria-hidden="true">
            <div className="skeleton h-4 w-3/4 self-center rounded-full bg-raised" />
            <div className="skeleton h-4 w-1/2 self-center rounded-full bg-raised" />
            <div className="skeleton h-4 w-2/3 self-center rounded-full bg-raised" />
          </div>
          <button type="button" onClick={() => back(step.from)} className="h-12 w-full rounded-full border border-line text-[15px] font-semibold text-ink hover:bg-raised">
            Annullér
          </button>
        </div>
      ) : step.kind === "photos" ? (
        <div key="photos" className="step-in flex flex-col gap-4 px-3 pb-2">
          <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
            {photos.map((photo, index) => (
              <li key={`${index}-${photo.slice(-40)}`} className="relative">
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
            {photos.length < MAX_PHOTOS ? (
              <li>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={scaling}
                  className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line bg-ground px-2 text-sm font-semibold text-ink-2 hover:border-accent hover:text-ink disabled:opacity-60"
                >
                  {photos.length ? <Plus size={22} aria-hidden="true" className="text-accent" /> : <Camera size={22} aria-hidden="true" className="text-accent" />}
                  {scaling ? "Behandler…" : photos.length ? "Næste side" : "Tag eller vælg billede"}
                </button>
              </li>
            ) : null}
          </ul>
          {photoInput}
          <p className={`m-0 text-[13px] ${photoError ? "text-danger" : "text-muted"}`} role={photoError ? "alert" : undefined}>
            {photoError ??
              `Tag et billede af opskriften, fx i en kogebog (op til ${MAX_PHOTOS} sider), eller af selve maden. Så genkender AI retten, skriver en opskrift og bruger billedet til retten.`}
          </p>
          <button
            type="button"
            disabled={photos.length === 0 || scaling}
            onClick={() => void read({ images: photos }, "photos", photos.length > 1 ? "Læser billederne…" : "Læser billedet…")}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent disabled:opacity-50"
          >
            <Sparkles size={17} aria-hidden="true" />
            {photos.length > 1 ? `Læs ${photos.length} billeder` : "Læs billedet"}
          </button>
        </div>
      ) : (
        <form key="start" onSubmit={fetchPasted} noValidate className="step-in flex flex-col gap-4 px-3 pb-2">
          <Field
            label={aiAvailable ? "Link, opskrift eller beskrivelse" : "Link til opskrift"}
            error={error}
            hint={
              what.kind === "url"
                ? `Link til ${what.host}`
                : what.kind === "text"
                  ? what.lines > 2
                    ? `Tekst på ${what.lines} linjer. AI læser opskriften.`
                    : "AI skriver en opskrift ud fra beskrivelsen, eller læser opskriften, hvis det er en."
                  : aiAvailable
                    ? "Indsæt et link eller en hel opskrift, eller beskriv retten med dine egne ord."
                    : "Virker med opskriftssider, der har struktureret opskriftsdata."
            }
          >
            {aiAvailable ? (
              <textarea
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                rows={what.kind === "text" ? 8 : 3}
                maxLength={30_000}
                placeholder="Et link, en hel opskrift, eller fx “kyllingegryde med kokosmælk, hurtig”"
                className={`${inputClass} h-auto resize-none py-3 leading-relaxed`}
              />
            ) : (
              <input type="url" inputMode="url" value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder="https://…" className={inputClass} />
            )}
          </Field>
          <button type="submit" className="flex h-12 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent">
            {what.kind === "text" ? <FileText size={17} aria-hidden="true" /> : <Link2 size={17} aria-hidden="true" />}
            Hent opskrift
          </button>

          <div className="flex items-center gap-3 text-[13px] text-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            eller
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Tile
              icon={<Camera size={20} aria-hidden="true" />}
              title="Foto"
              text={aiAvailable ? "Af opskriften eller af maden" : "Kræver en OpenAI-nøgle"}
              disabled={!aiAvailable}
              onClick={() => (photos.length ? setStep({ kind: "photos" }) : fileRef.current?.click())}
            />
            <Tile
              icon={<PenLine size={20} aria-hidden="true" />}
              title="Skriv selv"
              text={aiAvailable ? "AI kan udfylde resten" : "Udfyld felterne selv"}
              onClick={() => setStep({ kind: "form", from: "start" })}
            />
          </div>
          {photoInput}
          <p className="m-0 text-center text-[13px] text-muted">Du ser opskriften igennem, før den bliver gemt.</p>
        </form>
      )}
    </Sheet>
  );
}

/** A photo of the food itself becomes the dish's picture (downscaled like an uploaded dish photo). */
async function withDishPhoto(preview: DishPreview, images: readonly string[]): Promise<DishPreview> {
  const photo = preview.photo === undefined ? undefined : images[preview.photo];
  if (!photo || preview.dish.imageUrl) return preview;
  try {
    return { ...preview, dish: { ...preview.dish, imageUrl: await downscaleImage(dataUrlToBlob(photo)) } };
  } catch {
    return preview;
  }
}

function Tile({ icon, title, text, disabled, onClick }: { icon: ReactNode; title: string; text: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[96px] flex-col items-start gap-3 rounded-2xl bg-raised p-4 text-left hover:bg-line disabled:cursor-not-allowed disabled:opacity-55"
    >
      <span className="text-accent">{icon}</span>
      <span>
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        <span className="block text-[13px] text-ink-2">{text}</span>
      </span>
    </button>
  );
}
