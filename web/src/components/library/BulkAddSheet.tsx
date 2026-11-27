import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, ChevronDown, Loader2, RotateCcw, Sparkles } from "lucide-react";
import type { Dish, DishInput } from "@madplan/domain";
import { errorMessage, useDishActions } from "@/api/library-mutations";
import { Field, inputClass } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { eachLimited, MAX_BULK_DISHES, parseDishNames } from "@/lib/bulk-dishes";
import { findDuplicate } from "@/lib/dish-form";
import { plural } from "@/lib/library";
import { notify } from "@/lib/notify";

type Props = { open: boolean; dishes: readonly Dish[]; onClose: () => void };

type Row =
  | { name: string; state: "waiting" }
  | { name: string; state: "ready"; dish: DishInput; selected: boolean; duplicate?: Dish }
  | { name: string; state: "failed"; error: string };

/** At most this many AI calls at once. */
const PARALLEL = 3;

/** Several dish names in, AI-written recipes out; the family ticks the ones to keep. */
export function BulkAddSheet({ open, dishes, onClose }: Props) {
  const actions = useDishActions();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  // A new run (or closing) makes answers from an earlier run stale.
  const run = useRef(0);

  useEffect(() => {
    if (!open) return;
    run.current += 1;
    setText("");
    setRows(null);
    setError(undefined);
    setSaving(false);
  }, [open]);

  const names = parseDishNames(text);
  const update = (index: number, row: Row): void => setRows((current) => current && current.map((old, at) => (at === index ? row : old)));

  const write = async (name: string, index: number, id: number): Promise<void> => {
    try {
      const { dish } = await actions.draft({ name });
      if (run.current !== id) return;
      const duplicate = findDuplicate(dish.name, dishes) ?? findDuplicate(name, dishes);
      update(index, { name, state: "ready", dish, selected: !duplicate, ...(duplicate ? { duplicate } : {}) });
    } catch (failure) {
      if (run.current === id) update(index, { name, state: "failed", error: errorMessage(failure) });
    }
  };

  const start = (event: FormEvent): void => {
    event.preventDefault();
    if (names.length === 0) {
      setError("Skriv mindst én ret, én pr. linje.");
      return;
    }
    if (names.length > MAX_BULK_DISHES) {
      setError(`Højst ${MAX_BULK_DISHES} retter ad gangen.`);
      return;
    }
    const id = (run.current += 1);
    setError(undefined);
    setRows(names.map((name) => ({ name, state: "waiting" })));
    void eachLimited(names, PARALLEL, (name, index) => write(name, index, id));
  };

  const retry = (index: number, name: string): void => {
    update(index, { name, state: "waiting" });
    void write(name, index, run.current);
  };

  const toggle = (index: number): void =>
    setRows((current) => current && current.map((row, at) => (at === index && row.state === "ready" ? { ...row, selected: !row.selected } : row)));

  const chosen = (rows ?? []).flatMap((row) => (row.state === "ready" && row.selected ? [row.dish] : []));
  const pending = (rows ?? []).some((row) => row.state === "waiting");

  const save = async (): Promise<void> => {
    setSaving(true);
    const saved = new Set<DishInput>();
    try {
      for (const dish of chosen) {
        await actions.create(dish);
        saved.add(dish);
      }
      notify(`${plural(saved.size, "ret", "retter")} er tilføjet til jeres retter.`);
      onClose();
    } catch (failure) {
      setError(`${saved.size ? `${plural(saved.size, "ret", "retter")} blev gemt, men resten ikke: ` : ""}${errorMessage(failure)}`);
      // The saved ones leave the list, so "Gem" only tries the rest again.
      setRows((current) => current && current.filter((row) => !(row.state === "ready" && saved.has(row.dish))));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Flere retter på én gang" subtitle="AI skriver en opskrift til hver ret. Du vælger, hvilke der skal gemmes." tall={rows !== null}>
      {rows === null ? (
        <form onSubmit={start} noValidate className="flex flex-col gap-4 px-3 pb-2">
          <Field label="Retter" error={error} hint={`Én ret pr. linje, højst ${MAX_BULK_DISHES}. Fx “Lasagne” eller “Mormors frikadeller”.`}>
            <textarea
              value={text}
              autoFocus
              onChange={(event) => setText(event.target.value)}
              rows={8}
              placeholder={"Lasagne\nKylling i karry\nMormors frikadeller"}
              className={`${inputClass} h-auto min-h-[200px] py-3 leading-relaxed`}
            />
          </Field>
          <button type="submit" className="flex h-12 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent">
            <Sparkles size={18} aria-hidden="true" />
            {names.length > 0 ? `Skriv ${plural(names.length, "opskrift", "opskrifter")}` : "Skriv opskrifterne"}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-3 px-3 pb-2">
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-busy={pending}>
            {rows.map((row, index) => (
              <li key={row.name} className="rounded-2xl bg-ground p-3">
                {row.state === "waiting" ? (
                  <p className="m-0 flex h-11 items-center gap-3 text-[15px] text-ink-2">
                    <Loader2 size={18} aria-hidden="true" className="animate-spin text-muted" />
                    {row.name}
                    <span className="text-sm text-muted">skrives…</span>
                  </p>
                ) : row.state === "failed" ? (
                  <div className="flex items-center gap-3">
                    <p className="m-0 min-w-0 flex-1 text-[15px] text-ink">
                      {row.name}
                      <span className="block text-sm text-danger">{row.error}</span>
                    </p>
                    <button type="button" onClick={() => retry(index, row.name)} className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-semibold text-accent">
                      <RotateCcw size={15} aria-hidden="true" />
                      Prøv igen
                    </button>
                  </div>
                ) : (
                  <ReadyRow row={row} onToggle={() => toggle(index)} />
                )}
              </li>
            ))}
          </ul>
          {error ? (
            <p role="alert" className="m-0 rounded-2xl bg-offer-soft p-3 text-[15px] text-offer">{error}</p>
          ) : null}
          <div className="sticky bottom-0 -mx-3 flex gap-2.5 bg-surface px-3 pb-1 pt-2">
            <button type="button" onClick={() => setRows(null)} disabled={saving} className="h-12 flex-1 rounded-full border border-line text-[15px] font-semibold text-ink disabled:opacity-60">
              Tilbage
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || pending || chosen.length === 0}
              className="h-12 flex-1 rounded-full bg-accent text-[15px] font-semibold text-on-accent disabled:opacity-60"
            >
              {saving ? "Gemmer…" : pending ? "Skriver…" : chosen.length ? `Gem ${plural(chosen.length, "ret", "retter")}` : "Vælg retter"}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function ReadyRow({ row, onToggle }: { row: Extract<Row, { state: "ready" }>; onToggle: () => void }) {
  const { dish } = row;
  return (
    <div className="flex flex-col gap-1">
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={row.selected} onChange={onToggle} className="h-5 w-5 shrink-0 accent-[var(--c-accent)]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">{dish.name}</span>
          <span className="block text-sm text-muted">
            {dish.category} · {dish.prepMinutes} min · {plural(dish.ingredients.length, "ingrediens", "ingredienser")}
          </span>
        </span>
      </label>
      {row.duplicate ? (
        <p className="m-0 flex items-center gap-1.5 pl-8 text-sm text-ink-2">
          <AlertTriangle size={15} aria-hidden="true" className="shrink-0 text-offer" />
          Findes allerede{row.duplicate.archivedAt ? " i arkivet" : ""}: {row.duplicate.name}
        </p>
      ) : null}
      <details className="group pl-8">
        <summary className="flex h-9 cursor-pointer list-none items-center gap-1 text-sm text-accent">
          Se opskriften
          <ChevronDown size={15} aria-hidden="true" className="transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mb-1 mt-1 list-disc pl-5 text-sm text-ink-2">
          {dish.ingredients.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {dish.instructions?.length ? (
          <ol className="mb-1 mt-2 list-decimal pl-5 text-sm text-ink-2">
            {dish.instructions.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : null}
      </details>
    </div>
  );
}
