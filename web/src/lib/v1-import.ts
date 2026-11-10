import { migrateV1 } from "@madplan/domain";

export type V1Preview =
  | {
      ok: true;
      counts: { meals: number; dishes: number; profiles: number; saved: number };
      warnings: string[];
      json: unknown;
    }
  | { ok: false; error: string };

/** Parses the chosen file's text and previews what a v1 import would bring in (client side only). */
export function previewV1(text: string, now = new Date().toISOString()): V1Preview {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "Filen er ikke gyldig JSON. Vælg en eksport fra den gamle Meal Planner." };
  }
  const result = migrateV1(json, { now });
  if (!result.ok) return { ok: false, error: result.error };
  const { data } = result;
  return {
    ok: true,
    json,
    warnings: result.warnings,
    counts: {
      meals: Object.keys(data.meals).length,
      dishes: data.dishes.length,
      profiles: data.profiles.length,
      saved: data.savedInspirations.length,
    },
  };
}
