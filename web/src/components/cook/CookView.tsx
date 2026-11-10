import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { profileServings, targetServings } from "@madplan/domain";
import { useBootstrap } from "@/api/queries";
import { useIsWide } from "@/hooks/use-media";
import { useStepTimers } from "@/hooks/use-step-timers";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { clampServings, scaledLines } from "@/lib/cook-model";
import { detectTimer } from "@/lib/step-timers";
import { DishImage } from "@/components/ui/DishImage";
import { ErrorState } from "@/components/ui/StatusViews";
import { Sheet } from "@/components/ui/Sheet";
import { CookHeader } from "./CookHeader";
import { IngredientList } from "./IngredientList";
import { NoInstructions } from "./NoInstructions";
import { TimerControl } from "./TimerControl";

const SWIPE_PX = 60;

/** `#/lav-mad/<dishId>` – full-screen cooking mode, one step at a time. */
export function CookView({ dishId }: { dishId: string }) {
  const bootstrap = useBootstrap();
  const wide = useIsWide();
  const wake = useWakeLock();
  const timers = useStepTimers();
  const [step, setStep] = useState(0);
  const [chosenServings, setChosenServings] = useState<number>();
  const [drawer, setDrawer] = useState(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const data = bootstrap.data;
  const dish = data?.dishes.find((candidate) => candidate.id === dishId);
  const steps = dish?.instructions?.filter((text) => text.trim()) ?? [];
  const last = steps.length - 1;
  const defaultServings = data
    ? targetServings(profileServings(data.profiles), data.settings.preferredServings)
    : 4;
  const servings = clampServings(chosenServings ?? defaultServings);
  const lines = useMemo(() => (dish ? scaledLines(dish, servings) : []), [dish, servings]);

  const go = useCallback(
    (delta: number) => setStep((current) => Math.min(Math.max(current + delta, 0), Math.max(steps.length - 1, 0))),
    [steps.length],
  );
  const finish = (): void => {
    window.location.hash = "#/uge";
  };
  const forward = (): void => (step >= last ? finish() : go(1));

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (document.querySelector("dialog[open]") || (event.target as HTMLElement | null)?.closest("input,textarea")) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (step >= last) finish();
        else go(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, step, last]);

  if (bootstrap.isError && !data) return <ErrorState error={bootstrap.error} onRetry={() => void bootstrap.refetch()} />;
  if (!data) return <div className="skeleton m-4 h-64 rounded-3xl" aria-label="Henter retten" />;
  if (!dish) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-display text-2xl font-bold">Retten blev ikke fundet</h1>
        <a href="#/uge" className="flex h-12 items-center rounded-full border border-line px-6 font-semibold text-ink no-underline">
          Tilbage til ugen
        </a>
      </div>
    );
  }

  const current = steps[step] ?? "";
  const detected = detectTimer(current);
  const ingredients = <IngredientList lines={lines} servings={servings} onServings={(value) => setChosenServings(clampServings(value))} />;

  const onPointerDown = (event: PointerEvent): void => {
    swipeStart.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent): void => {
    const origin = swipeStart.current;
    swipeStart.current = null;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) forward();
    else go(-1);
  };

  return (
    <div className="grid h-full grid-cols-1 bg-ground md:grid-cols-[380px_minmax(0,1fr)]">
      {wide ? (
        <aside aria-label="Ingredienser" className="flex min-h-0 flex-col bg-surface">
          <DishImage dish={dish} width={380} height={200} className="h-[200px] w-full shrink-0" eager />
          <div className="flex min-h-0 flex-1 flex-col px-[26px] py-[22px]">{ingredients}</div>
        </aside>
      ) : null}
      <section
        aria-label="Fremgangsmåde"
        className="flex min-h-0 flex-col gap-4 px-4 pb-5 pt-4 md:gap-[22px] md:px-10 md:pb-8 md:pt-[26px]"
        style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
      >
        <CookHeader
          title={dish.name}
          wake={wake}
          timers={timers.active}
          wide={wide}
          onIngredients={() => setDrawer(true)}
          onGoToStep={setStep}
        />
        {steps.length === 0 ? (
          <NoInstructions dish={dish} lines={lines} servings={servings} onServings={(value) => setChosenServings(clampServings(value))} />
        ) : (
          <>
            <div
              role="progressbar"
              aria-label="Fremskridt"
              aria-valuemin={1}
              aria-valuemax={steps.length}
              aria-valuenow={step + 1}
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
            >
              {steps.map((_, index) => (
                <span
                  key={index}
                  className={`h-1.5 rounded-full ${index < step ? "bg-[#4FA9B8]" : index === step ? "bg-accent" : "bg-[#23262D]"}`}
                />
              ))}
            </div>
            <div
              className="flex min-h-0 flex-1 touch-pan-y flex-col justify-center gap-5 md:gap-[22px]"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => (swipeStart.current = null)}
            >
              <span className="text-sm font-semibold uppercase tracking-[0.04em] text-accent md:text-base">
                Trin {step + 1} af {steps.length}
              </span>
              <p
                aria-live="polite"
                className="m-0 max-w-[780px] font-display text-[30px] font-medium leading-[1.2] tracking-[-0.01em] md:text-[46px] md:leading-[1.18]"
              >
                {current}
              </p>
              {detected ? (
                <TimerControl
                  detected={detected}
                  timer={timers.timers[step]}
                  now={timers.now}
                  onStart={() => timers.start(step, detected.seconds)}
                  onPause={() => timers.pause(step)}
                  onReset={() => timers.reset(step)}
                />
              ) : null}
              {step < last ? (
                <p className="m-0 mt-2 max-w-[780px] text-sm text-muted md:text-base">Næste: {steps[step + 1]}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3 md:gap-3.5">
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={step === 0}
                className="flex h-[72px] items-center justify-center gap-2.5 rounded-3xl border border-line bg-transparent text-xl font-semibold text-ink disabled:opacity-40 md:h-[88px] md:text-[22px]"
              >
                <ChevronLeft size={24} aria-hidden="true" />
                Forrige
              </button>
              <button
                type="button"
                onClick={forward}
                className="flex h-[72px] items-center justify-center gap-2.5 rounded-3xl border-0 bg-accent text-xl font-semibold text-on-accent md:h-[88px] md:text-[22px]"
              >
                {step >= last ? "Færdig – velbekomme" : "Næste trin"}
                <ChevronRight size={24} aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </section>
      {wide ? null : (
        <Sheet open={drawer} onClose={() => setDrawer(false)} title="Ingredienser" tall>
          <div className="px-3 pb-3">
            <IngredientList
              lines={lines}
              servings={servings}
              onServings={(value) => setChosenServings(clampServings(value))}
              hideTitle
            />
          </div>
        </Sheet>
      )}
    </div>
  );
}
