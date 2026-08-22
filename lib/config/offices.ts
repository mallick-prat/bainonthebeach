// Small configured office/team list. Mirrors the check constraint in
// supabase/migrations. Codes only; no freeform text.

export const OFFICES = [
  { code: "BOS", label: "Boston" },
  { code: "NYC", label: "New York" },
  { code: "SF", label: "San Francisco" },
  { code: "CHI", label: "Chicago" },
  { code: "LON", label: "London" },
  { code: "SYD", label: "Sydney" },
] as const;

export const OFFICE_CODES = OFFICES.map((o) => o.code) as readonly string[];

export function isValidOffice(code: unknown): code is string {
  return typeof code === "string" && OFFICE_CODES.includes(code);
}

export function officeLabel(code: string | null): string | null {
  if (!code) return null;
  return OFFICES.find((o) => o.code === code)?.label ?? code;
}
