import { useMemo } from "react";
import type { BootstrapResponse } from "@madplan/domain";
import type { MealActions } from "@/api/meal-mutations";
import { buildDay, buildWeek, type DayModel } from "@/lib/week-model";
import { mondayOf } from "@/lib/route";
import { DayActionsSheet, type DayAction } from "./sheets/DayActionsSheet";
import { DishPickerSheet } from "./sheets/DishPickerSheet";
import { NoteSheet } from "./sheets/NoteSheet";
import { RecipeSheet } from "./sheets/RecipeSheet";
import { SwapDaySheet } from "./sheets/SwapDaySheet";
import { VariantSheet } from "./sheets/VariantSheet";

export type SheetState = {
  kind: "actions" | "picker" | "swap" | "note" | "variant" | "recipe";
  date: string;
} | null;

type Props = {
  sheet: SheetState;
  setSheet: (sheet: SheetState) => void;
  data: BootstrapResponse;
  today: string;
  actions: MealActions;
};

/** Renders whichever day sheet is open and wires its choices to the meal mutations. */
export function WeekSheets({ sheet, setSheet, data, today, actions }: Props) {
  const day: DayModel | null = useMemo(
    () => (sheet ? buildDay(sheet.date, today, data.meals, data.dishes, data.profiles) : null),
    [sheet, today, data.meals, data.dishes, data.profiles],
  );
  const sameWeek = useMemo(
    () => (sheet ? buildWeek(mondayOf(sheet.date), today, data.meals, data.dishes, data.profiles) : []),
    [sheet, today, data.meals, data.dishes, data.profiles],
  );
  const close = (): void => setSheet(null);
  const forKind = (kind: NonNullable<SheetState>["kind"]): DayModel | null =>
    sheet?.kind === kind ? day : null;

  const onAction = (action: DayAction): void => {
    if (!sheet || !day) return;
    const date = sheet.date;
    switch (action) {
      case "pick":
        return setSheet({ kind: "picker", date });
      case "swap":
        return setSheet({ kind: "swap", date });
      case "note":
        return setSheet({ kind: "note", date });
      case "variant":
        return setSheet({ kind: "variant", date });
      case "suggest":
        actions.suggest(date);
        return close();
      case "lock":
        actions.patchMeal(date, { locked: !day.locked });
        return close();
      case "remove":
        actions.removeMeal(date);
        return close();
    }
  };

  return (
    <>
      <DayActionsSheet day={forKind("actions")} onClose={close} onAction={onAction} />
      <DishPickerSheet
        open={sheet?.kind === "picker"}
        dayLabel={day?.longLabel ?? ""}
        dishes={data.dishes}
        meals={data.meals}
        today={today}
        onClose={close}
        onPick={(dishId) => {
          if (!sheet) return;
          actions.setMeal(sheet.date, { dishId, source: "manual", note: day?.meal?.note ?? "" });
          close();
        }}
      />
      <SwapDaySheet
        from={forKind("swap")}
        days={sameWeek}
        onClose={close}
        onPick={(other) => {
          if (!sheet) return;
          void actions.swap(sheet.date, other);
          close();
        }}
      />
      <NoteSheet
        day={forKind("note")}
        onClose={close}
        onSave={(note) => {
          if (sheet) actions.patchMeal(sheet.date, { note });
          close();
        }}
      />
      <VariantSheet
        day={forKind("variant")}
        profiles={data.profiles}
        onClose={close}
        onSave={(variants) => {
          if (sheet) actions.patchMeal(sheet.date, { variants });
          close();
        }}
      />
      <RecipeSheet day={forKind("recipe")} onClose={close} />
    </>
  );
}
