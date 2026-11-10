/** Tiny hand-written validation helpers. Every failure is a 400 with a Danish message. */
import { badRequest } from "./errors.ts";

export type Rec = Record<string, unknown>;

export const isRec = (value: unknown): value is Rec =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function rec(value: unknown, what: string): Rec {
  if (!isRec(value)) throw badRequest(`${what} skal være et objekt.`);
  return value;
}

export function str(
  value: unknown,
  what: string,
  opts: { min?: number; max?: number; trim?: boolean } = {},
): string {
  if (typeof value !== "string") throw badRequest(`${what} skal være tekst.`);
  const text = opts.trim === false ? value : value.trim();
  const { min = 0, max = 500 } = opts;
  if (text.length < min) throw badRequest(`${what} må ikke være tom.`);
  if (text.length > max) throw badRequest(`${what} er for lang (maks. ${max} tegn).`);
  return text;
}

export function optStr(value: unknown, what: string, max = 500): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return str(value, what, { max });
}

export function num(
  value: unknown,
  what: string,
  opts: { min?: number; max?: number; int?: boolean } = {},
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw badRequest(`${what} skal være et tal.`);
  }
  if (opts.int && !Number.isInteger(value)) throw badRequest(`${what} skal være et heltal.`);
  if (opts.min !== undefined && value < opts.min) throw badRequest(`${what} er for lav.`);
  if (opts.max !== undefined && value > opts.max) throw badRequest(`${what} er for høj.`);
  return value;
}

export function optNum(
  value: unknown,
  what: string,
  opts: { min?: number; max?: number; int?: boolean } = {},
): number | undefined {
  return value === undefined || value === null ? undefined : num(value, what, opts);
}

export function bool(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") throw badRequest(`${what} skal være ja eller nej.`);
  return value;
}

export function optBool(value: unknown, what: string): boolean | undefined {
  return value === undefined ? undefined : bool(value, what);
}

export function list<T>(
  value: unknown,
  what: string,
  item: (entry: unknown, index: number) => T,
  max = 500,
): T[] {
  if (!Array.isArray(value)) throw badRequest(`${what} skal være en liste.`);
  if (value.length > max) throw badRequest(`${what} har for mange elementer (maks. ${max}).`);
  return value.map((entry, index) => item(entry, index));
}

export function strList(value: unknown, what: string, max = 200, itemMax = 200): string[] {
  return list(value, what, (entry) => str(entry, what, { min: 1, max: itemMax }), max);
}

export function optStrList(value: unknown, what: string, max = 200): string[] | undefined {
  return value === undefined ? undefined : strList(value, what, max);
}

export function oneOf<T extends string>(value: unknown, what: string, allowed: readonly T[]): T {
  const found = allowed.find((candidate) => candidate === value);
  if (found === undefined) throw badRequest(`${what} har en ugyldig værdi.`);
  return found;
}

/** Drops undefined keys so optional fields stay absent in JSON and in equality checks. */
export function compact<T extends Rec>(value: T): T {
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return value;
}
