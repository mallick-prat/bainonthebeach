// Phone-number handling shared by the web app and the WhatsApp worker.
// E.164 everywhere; libphonenumber-js/max is authoritative on both sides.

import {
  isValidPhoneNumber,
  parsePhoneNumberWithError,
} from "libphonenumber-js/max";

export interface NormalizedPhone {
  e164: string; // +16175551212
  countryCode: string; // US
  lastFour: string; // 1212
}

/**
 * Parses and validates an international phone number. Returns null for
 * impossible numbers, missing country codes, or numbers with extensions.
 * Never "normalizes" by stripping punctuation alone.
 */
export function normalizePhone(input: string): NormalizedPhone | null {
  if (typeof input !== "string" || input.trim().length === 0) return null;
  const trimmed = input.trim();
  if (!trimmed.startsWith("+")) return null; // country code is required
  try {
    const parsed = parsePhoneNumberWithError(trimmed);
    if (!parsed || parsed.ext) return null;
    if (!isValidPhoneNumber(trimmed)) return null;
    const e164 = parsed.number;
    return {
      e164,
      countryCode: parsed.country ?? "",
      lastFour: e164.slice(-4),
    };
  } catch {
    return null;
  }
}

/** Obvious test values that must never reach production sync. */
export function isClearlyTestNumber(e164: string): boolean {
  const digits = e164.replace(/^\+/, "");
  return (
    /^(\d)\1+$/.test(digits) || // +1111111111
    digits.includes("5550100") || // fictional ranges
    digits.includes("5550199") ||
    /1234567/.test(digits)
  );
}

/**
 * WhatsApp JID for a validated E.164 number. Worker-side use only; JIDs
 * never reach the browser.
 */
export function phoneToWhatsAppJid(phoneE164: string): string {
  const digits = phoneE164.replace(/^\+/, "");
  if (!/^\d{6,15}$/.test(digits)) {
    throw new Error("phoneToWhatsAppJid requires a validated E.164 number");
  }
  return `${digits}@s.whatsapp.net`;
}

/** Redacts phone digits and JIDs from any string destined for logs. */
export function redactPhones(text: string): string {
  return text
    .replace(/\d{6,15}@s\.whatsapp\.net/g, "[redacted-jid]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, (m) => {
      const digits = m.replace(/\D/g, "");
      return `[redacted-...${digits.slice(-4)}]`;
    });
}

/** Display form for the OWN user only, e.g. "+1 ... 1212". */
export function ownPhoneDisplay(lastFour: string, countryCode: string): string {
  return `${countryCode ? countryCode + " " : ""}... ${lastFour}`;
}
