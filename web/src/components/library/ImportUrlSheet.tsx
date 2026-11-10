import { useEffect, useState, type FormEvent } from "react";
import { Clock, Link2 } from "lucide-react";
import type { Dish } from "@madplan/domain";
import { errorMessage, useDishActions } from "@/api/library-mutations";
import { Field, inputClass } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { plural } from "@/lib/library";
import { notify } from "@/lib/notify";
import { routeHref } from "@/lib/route";

type Props = { open: boolean; onClose: () => void; onEdit: (dish: Dish) => void };

/**
 * The server stores the parsed recipe as soon as it is fetched (contract: POST api/dishes/import-url -> Dish),
 * so the preview shows what was saved, with the option to undo it.
 */
export function ImportUrlSheet({ open, onClose, onEdit }: Props) {
  const actions = useDishActions();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState<Dish | undefined>();

  useEffect(() => {
    if (open) {
      setUrl("");
      setError(undefined);
      setSaved(undefined);
    }
  }, [open]);

  const fetchRecipe = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!/^https?:\/\/\S+$/iu.test(url.trim())) {
      setError("Indsæt et link, der starter med http:// eller https://.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      setSaved(await actions.importUrl(url.trim()));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const undo = (): void => {
    if (!saved) return;
    actions.archive(saved.id).catch(() => undefined);
    setSaved(undefined);
    notify("Importen er fortrudt.");
  };

  return (
    <Sheet open={open} onClose={onClose} title="Hent opskrift fra link" subtitle="Virker med sider, der har struktureret opskriftsdata" tall={Boolean(saved)}>
      {saved ? (
        <div className="flex flex-col gap-4 px-3 pb-2">
          <p className="m-0 rounded-2xl bg-accent-soft p-3 text-[15px] text-accent">Opskriften er hentet og gemt i dine retter.</p>
          <div className="rounded-3xl bg-raised p-5">
            <h3 className="font-display m-0 text-xl font-bold">{saved.name}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <Clock size={14} aria-hidden="true" />
              {saved.prepMinutes} min · {saved.category} · {plural(saved.ingredients.length, "ingrediens", "ingredienser")}
              {saved.instructions ? ` · ${plural(saved.instructions.length, "trin", "trin")}` : ""}
            </p>
            <ul className="mb-0 mt-3 list-disc pl-5 text-[15px] text-ink-2">
              {saved.ingredients.slice(0, 6).map((ingredient) => (
                <li key={ingredient}>{ingredient}</li>
              ))}
            </ul>
            {saved.ingredients.length > 6 ? <p className="mb-0 mt-2 text-sm text-muted">… og {saved.ingredients.length - 6} flere</p> : null}
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" onClick={undo} className="h-12 flex-1 rounded-full border border-line px-5 text-[15px] font-semibold text-ink">
              Fortryd
            </button>
            <button type="button" onClick={() => onEdit(saved)} className="h-12 flex-1 rounded-full border border-line px-5 text-[15px] font-semibold text-ink">
              Redigér først
            </button>
            <a
              href={routeHref({ name: "retter", dishId: saved.id })}
              onClick={onClose}
              className="flex h-12 flex-1 items-center justify-center rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent no-underline"
            >
              Åbn ret
            </a>
          </div>
        </div>
      ) : (
        <form onSubmit={(event) => void fetchRecipe(event)} noValidate className="flex flex-col gap-4 px-3 pb-2">
          <Field label="Link til opskrift" error={error}>
            <input type="url" inputMode="url" autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" className={inputClass} />
          </Field>
          <button type="submit" disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent disabled:opacity-60">
            <Link2 size={18} aria-hidden="true" />
            {busy ? "Henter opskrift…" : "Hent opskrift"}
          </button>
        </form>
      )}
    </Sheet>
  );
}
