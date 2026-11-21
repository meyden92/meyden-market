import type { Scene } from "./types";

type Data = Scene["data"];

export const str = (d: Data, key: string): string | undefined => {
  const v = d?.[key];
  return typeof v === "string" && v !== "" ? v : undefined;
};

export const num = (d: Data, key: string): number | undefined => {
  const v = d?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
};

/** Array of strings, or of objects with a `key` string field. */
export const strs = (d: Data, key: string, field = "text"): string[] | undefined => {
  const v = d?.[key];
  if (!Array.isArray(v)) return undefined;
  return v.map((x) =>
    typeof x === "string" ? x : typeof x === "object" && x !== null && typeof (x as Record<string, unknown>)[field] === "string"
      ? ((x as Record<string, unknown>)[field] as string)
      : String(x),
  );
};

export const obj = (d: Data, key: string): Record<string, unknown> | undefined => {
  const v = d?.[key];
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
};

/** Lines of onScreen, used when a scene has no data. */
export const lines = (text: string) => text.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
