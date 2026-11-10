import { lazy, Suspense, useState } from "react";
import { MotionConfig } from "motion/react";
import { useIsWide } from "@/hooks/use-media";
import { useRoute } from "@/hooks/use-route";
import { useToday } from "@/hooks/use-today";
import { useLiveUpdates } from "@/api/live-updates";
import { useBootstrap } from "@/api/queries";
import { mondayOf, type Route } from "@/lib/route";
import { BottomNav, PhoneHeader } from "@/components/shell/PhoneChrome";
import { TopBar } from "@/components/shell/TopBar";
import { Toast } from "@/components/ui/Toast";
import { OfflineBanner } from "@/components/ui/StatusViews";
import { RouteSkeleton } from "@/components/ui/Skeletons";
import { useAssistOpen } from "@/lib/assist-store";
import { WeekView } from "@/components/week/WeekView";

// Everything except the week view is split into its own chunk and loaded on first visit.
const CookView = lazy(() => import("@/components/cook/CookView").then((m) => ({ default: m.CookView })));
const PlanFlow = lazy(() => import("@/components/plan/PlanFlow").then((m) => ({ default: m.PlanFlow })));
const ShoppingView = lazy(() => import("@/components/shopping/ShoppingView").then((m) => ({ default: m.ShoppingView })));
const LibraryView = lazy(() => import("@/components/library/LibraryView").then((m) => ({ default: m.LibraryView })));
const SettingsView = lazy(() => import("@/components/settings/SettingsView").then((m) => ({ default: m.SettingsView })));
const AssistSheet = lazy(() => import("@/components/assist/AssistSheet").then((m) => ({ default: m.AssistSheet })));

/** Loads the Assist sheet on first open and keeps it mounted afterwards (so the chat and the close animation survive). */
function AssistHost() {
  const open = useAssistOpen();
  const [loaded, setLoaded] = useState(open);
  if (open && !loaded) setLoaded(true);
  return loaded ? (
    <Suspense fallback={null}>
      <AssistSheet />
    </Suspense>
  ) : null;
}

export function App() {
  const { route, navigate } = useRoute();
  const today = useToday();
  const wide = useIsWide();
  const connected = useLiveUpdates();
  const bootstrap = useBootstrap();

  // The shown week follows "today" across Monday unless the user navigated to another week.
  const currentWeek = mondayOf(today);
  const weekStart = route.name === "uge" && route.week ? route.week : currentWeek;
  const changeWeek = (week: string): void =>
    navigate({ name: "uge", week: week === currentWeek ? undefined : week } satisfies Route);

  const offline = !connected || bootstrap.isRefetchError;

  if (route.name === "lav-mad") {
    // Cooking mode owns the whole screen: no navigation chrome.
    return (
      <MotionConfig reducedMotion="user">
        <div className="h-dvh overflow-hidden bg-ground text-ink">
          <Suspense fallback={<RouteSkeleton />}>
            <CookView dishId={route.dishId} />
          </Suspense>
          <Toast />
        </div>
      </MotionConfig>
    );
  }

  if (route.name === "planlaeg") {
    // The planning flow is full-screen too.
    return (
      <MotionConfig reducedMotion="user">
        <div className="flex h-dvh flex-col overflow-hidden bg-ground text-ink">
          {offline ? <OfflineBanner /> : null}
          <Suspense fallback={<RouteSkeleton />}>
            <PlanFlow />
          </Suspense>
          <Toast />
        </div>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-dvh flex-col overflow-hidden bg-ground text-ink">
        {wide ? (
          <TopBar route={route} weekStart={weekStart} onWeekChange={changeWeek} />
        ) : route.name === "indkob" ? null : (
          <PhoneHeader weekStart={weekStart} onWeekChange={changeWeek} />
        )}
        {offline ? <OfflineBanner /> : null}
        <main className="min-h-0 flex-1 overflow-y-auto">
          {route.name === "uge" ? (
            <WeekView weekStart={weekStart} />
          ) : (
            <Suspense fallback={<RouteSkeleton />}>
              {route.name === "indkob" ? (
                <ShoppingView />
              ) : route.name === "retter" ? (
                <LibraryView {...(route.dishId ? { dishId: route.dishId } : {})} {...(route.tab ? { tab: route.tab } : {})} />
              ) : (
                <SettingsView />
              )}
            </Suspense>
          )}
        </main>
        {wide ? null : <BottomNav route={route} />}
        <AssistHost />
        <Toast />
      </div>
    </MotionConfig>
  );
}
