/** Callbacks the week view hands to its cards, hero and list rows. */
export type DayHandlers = {
  openRecipe: (date: string) => void;
  openActions: (date: string) => void;
  openPicker: (date: string) => void;
  suggest: (date: string) => void;
};
