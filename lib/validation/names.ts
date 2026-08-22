// Display-name normalization and validation.
// Preserve legitimate international names; reject control characters,
// bidi abuse, invisible-only names, and markup.

const CONTROL_OR_FORMAT =
  // C0/C1 controls, zero-width chars, bidi controls, line separators, BOM.
  new RegExp(
    "[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]",
    "g",
  );

const MAX_VISIBLE = 32;

export type NameResult =
  | { ok: true; name: string }
  | { ok: false; error: "empty" | "too_long" | "invalid" };

export function normalizeDisplayName(input: string): NameResult {
  if (typeof input !== "string") return { ok: false, error: "invalid" };
  let name = input.normalize("NFC");
  name = name.replace(CONTROL_OR_FORMAT, "");
  name = name.replace(/\s+/g, " ").trim();
  if (name.length === 0) return { ok: false, error: "empty" };
  // Reject anything that looks like markup rather than a name.
  if (/[<>]/.test(name)) return { ok: false, error: "invalid" };
  const visible = [...name];
  if (visible.length > MAX_VISIBLE) return { ok: false, error: "too_long" };
  // Reject names with no visible ink (only spaces/marks after stripping).
  if (!/[\p{L}\p{N}\p{S}\p{P}]/u.test(name))
    return { ok: false, error: "invalid" };
  return { ok: true, name };
}

/** Case/diacritic-insensitive key for sorting the WHO'S HERE list. */
export function nameSortKey(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
