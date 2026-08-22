import { describe, expect, it } from "vitest";
import { emailDomain, isEmailAllowed, parseAllowedDomains } from "@/lib/auth/domains";

describe("allowed domain parsing", () => {
  it("unset means open", () => {
    expect(parseAllowedDomains(undefined)).toEqual({ kind: "open" });
    expect(parseAllowedDomains("")).toEqual({ kind: "open" });
    expect(parseAllowedDomains("   ")).toEqual({ kind: "open" });
  });

  it("parses a normal list with spaces and leading @", () => {
    const result = parseAllowedDomains(" bain.com , @example.org ");
    expect(result).toEqual({ kind: "list", domains: ["bain.com", "example.org"] });
  });

  it("malformed lists are invalid (fail closed)", () => {
    expect(parseAllowedDomains("not a domain").kind).toBe("invalid");
    expect(parseAllowedDomains("bain").kind).toBe("invalid");
    expect(parseAllowedDomains(",,,").kind).toBe("invalid");
  });
});

describe("email domain extraction", () => {
  it("extracts and lowercases", () => {
    expect(emailDomain("A@Bain.COM")).toBe("bain.com");
  });

  it("uses the last @", () => {
    expect(emailDomain('"a@evil.com"@bain.com')).toBe("bain.com");
  });

  it("rejects junk", () => {
    expect(emailDomain("nope")).toBeNull();
    expect(emailDomain("a@")).toBeNull();
    expect(emailDomain("@bain.com")).toBeNull();
    expect(emailDomain("a@bain .com")).toBeNull();
  });
});

describe("allowlist enforcement", () => {
  const list = parseAllowedDomains("bain.com");

  it("exact domain matches", () => {
    expect(isEmailAllowed("x@bain.com", list)).toBe(true);
  });

  it("is not a naive substring check", () => {
    expect(isEmailAllowed("x@evilbain.com", list)).toBe(false);
    expect(isEmailAllowed("x@bain.com.evil.io", list)).toBe(false);
    expect(isEmailAllowed("x@sub.bain.com", list)).toBe(false);
  });

  it("fails closed on an invalid allowlist", () => {
    expect(isEmailAllowed("x@bain.com", parseAllowedDomains("garbage!"))).toBe(false);
  });

  it("open allowlist permits anything valid", () => {
    expect(isEmailAllowed("x@anywhere.dev", { kind: "open" })).toBe(true);
  });
});
