import { describe, expect, it } from "vitest";
import { nameSortKey, normalizeDisplayName } from "@/lib/validation/names";

describe("display name normalization", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeDisplayName("  Priya   S  ")).toEqual({ ok: true, name: "Priya S" });
  });

  it("preserves international names", () => {
    for (const name of ["José", "Æble Ørsted", "山田太郎", "O'Brien", "Anne-Marie"]) {
      const result = normalizeDisplayName(name);
      expect(result).toEqual({ ok: true, name });
    }
  });

  it("strips control and bidi characters", () => {
    const result = normalizeDisplayName("Ca‮sey");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.name).toBe("Casey");
  });

  it("rejects invisible-only names", () => {
    expect(normalizeDisplayName("​​").ok).toBe(false);
    expect(normalizeDisplayName("   ").ok).toBe(false);
    expect(normalizeDisplayName("").ok).toBe(false);
  });

  it("rejects markup", () => {
    expect(normalizeDisplayName("<script>x</script>").ok).toBe(false);
    expect(normalizeDisplayName("a<b").ok).toBe(false);
  });

  it("enforces 32 visible characters", () => {
    expect(normalizeDisplayName("x".repeat(32)).ok).toBe(true);
    expect(normalizeDisplayName("x".repeat(33)).ok).toBe(false);
  });

  it("sort key ignores case and diacritics", () => {
    expect(nameSortKey("Álvaro")).toBe("alvaro");
    expect(nameSortKey("ZOË")).toBe("zoe");
  });
});
