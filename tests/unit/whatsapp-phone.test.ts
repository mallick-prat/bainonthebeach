import { describe, expect, it } from "vitest";
import {
  isClearlyTestNumber,
  normalizePhone,
  phoneToWhatsAppJid,
  redactPhones,
} from "@/lib/whatsapp/phone";

describe("phone normalization", () => {
  it("normalizes international numbers to E.164", () => {
    expect(normalizePhone("+1 617 555 8331")).toEqual({
      e164: "+16175558331",
      countryCode: "US",
      lastFour: "8331",
    });
    expect(normalizePhone("+44 7911 123456")?.e164).toBe("+447911123456");
    expect(normalizePhone("+91 98765 43210")?.countryCode).toBe("IN");
  });

  it("requires a country code (no bare national numbers)", () => {
    expect(normalizePhone("617 555 8331")).toBeNull();
    expect(normalizePhone("06 12 34 56 78")).toBeNull();
  });

  it("rejects impossible numbers", () => {
    expect(normalizePhone("+1 999 999 99999999")).toBeNull();
    expect(normalizePhone("+1 1")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
  });

  it("does not merely strip punctuation", () => {
    // Looks digit-y after stripping, but is not a valid number anywhere.
    expect(normalizePhone("+0 (000) 000-0000")).toBeNull();
  });

  it("flags clearly fake test values", () => {
    expect(isClearlyTestNumber("+11111111111")).toBe(true);
    expect(isClearlyTestNumber("+16175550100")).toBe(true);
    expect(isClearlyTestNumber("+16175558331")).toBe(false);
  });
});

describe("whatsapp jid conversion", () => {
  it("converts validated E.164 to a JID", () => {
    expect(phoneToWhatsAppJid("+16175558331")).toBe(
      "16175558331@s.whatsapp.net",
    );
  });

  it("refuses unvalidated input", () => {
    expect(() => phoneToWhatsAppJid("garbage")).toThrow();
    expect(() => phoneToWhatsAppJid("+1 (617) 555-8331")).toThrow();
  });
});

describe("phone redaction", () => {
  it("redacts phone numbers in log strings", () => {
    const out = redactPhones("failed to add +16175558331 to the group");
    expect(out).not.toContain("16175558331");
    expect(out).toContain("...8331");
  });

  it("redacts JIDs", () => {
    const out = redactPhones("participant 16175558331@s.whatsapp.net rejected");
    expect(out).not.toContain("@s.whatsapp.net");
  });
});
