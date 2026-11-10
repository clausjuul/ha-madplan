import {
  DISHES,
  addDaysToKey,
  dateKey,
  parseDateKey,
  startOfWeek,
  type BootstrapResponse,
  type Dish,
  type FridgeItem,
  type Meal,
  type MealMap,
  type Profile,
} from "@madplan/domain";

export type FakeState = Omit<BootstrapResponse, "revision" | "capabilities" | "isEmpty">;

const GENERATED_DISH: Dish = {
  id: "kyllingewok-lime",
  name: "Kyllingewok med lime",
  ingredients: ["500 g kylling", "300 g nudler", "1 peberfrugt", "2 limefrugter", "2 spsk. sojasovs"],
  prepMinutes: 25,
  category: "Wok",
  favorite: false,
  leftoverFriendly: true,
  freezerFriendly: false,
  imageKey: "kyllingewok",
  custom: true,
  generated: true,
  instructions: ["Steg kyllingen.", "Tilsæt grønt og nudler.", "Smag til med lime og soja."],
};

/** A dish with no bundled photo, to exercise the generated colour surface. */
const HOME_DISH: Dish = {
  id: "mormors-aebleflaesk",
  name: "Mormors æbleflæsk",
  ingredients: ["400 g flæsk", "3 æbler", "1 løg"],
  prepMinutes: 30,
  category: "Dansk",
  favorite: true,
  leftoverFriendly: false,
  freezerFriendly: false,
  custom: true,
};

function profile(id: string, name: string): Profile {
  return {
    id,
    name,
    active: true,
    exclusions: [],
    preferences: [],
    dislikes: [],
    favoriteDishIds: [],
  };
}

function meal(dishId: string, extra: Partial<Meal> = {}): Meal {
  return { dishId, locked: false, note: "", source: "manual", ...extra };
}

/** A realistic family week around `today`: last week eaten, this week mostly planned, a few days next week. */
export function seedFakeState(today: string): FakeState {
  const monday = dateKey(startOfWeek(parseDateKey(today)));
  const at = (offset: number): string => addDaysToKey(monday, offset);

  const meals: MealMap = {
    // Two older weeks of history, so most of the catalog is not "new" in the planning demo.
    [at(-14)]: meal("carbonara"),
    [at(-13)]: meal("kyllingewok"),
    [at(-12)]: meal("hotdogs"),
    [at(-11)]: meal("stegt-flaesk"),
    [at(-10)]: meal("millionboef"),
    [at(-9)]: meal("pitabroed-kebab"),
    [at(-8)]: meal("kartoffelsuppe"),
    [at(-7)]: meal("pasta-bolognese"),
    [at(-6)]: meal("frikadeller"),
    [at(-5)]: meal("fiskefrikadeller"),
    [at(-4)]: meal("chili-con-carne"),
    [at(-3)]: meal("burgere"),
    [at(-2)]: meal("kylling-i-karry"),
    [at(-1)]: meal("rugbroed", { skipped: true }),
    [at(0)]: meal("lasagne", {
      source: "local",
      reason: "Bruger spinaten og fløden, der skal spises først.",
    }),
    [at(1)]: meal("laks"),
    [at(2)]: meal(GENERATED_DISH.id, {
      source: "ai",
      reason: "En ny wok med det, der er i køleskabet.",
    }),
    [at(3)]: meal("tomatsuppe", {
      source: "local",
      reason: "Tomater er på tilbud.",
      offer: {
        store: "Netto",
        item: "Hakkede tomater",
        price: "5,00 kr.",
        sourceUrl: "https://example.invalid/tilbud",
      },
    }),
    [at(4)]: meal("pizza", { locked: true, note: "Fredagspizza hos farmor" }),
    [at(6)]: meal("tacos"),
    [at(7)]: meal("pasta-bolognese"),
    [at(8)]: meal(HOME_DISH.id),
    [at(9)]: meal("kyllingewraps"),
  };

  const fridge: FridgeItem[] = [
    { name: "Spinat", quantity: "1 pose", expiresOn: addDaysToKey(today, 1), useFirst: true },
    { name: "Fløde", quantity: "2,5 dl", expiresOn: addDaysToKey(today, 3) },
    { name: "Gulerødder", quantity: "1 kg", expiresOn: addDaysToKey(today, 9) },
  ];

  return {
    meals,
    dishes: [...DISHES, GENERATED_DISH, HOME_DISH],
    profiles: [profile("p1", "Mor"), profile("p2", "Far"), profile("p3", "Alexander")],
    fridge,
    pantry: ["salt", "peber", "olie", "mel"],
    settings: { globalExclusions: [], preferredStores: ["netto"], preferredServings: 3 },
    savedInspirations: [],
  };
}
