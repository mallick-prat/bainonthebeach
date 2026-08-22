import { describe, expect, it } from "vitest";
import { applyStatus, statusIsConsistent } from "@/lib/data/statusInvariant";

describe("status timestamp invariant", () => {
  it("joining sets on_beach_since to now", () => {
    const now = new Date("2026-08-22T12:00:00Z");
    const fields = applyStatus(true, now);
    expect(fields).toEqual({ onBeach: true, onBeachSince: now.toISOString() });
    expect(statusIsConsistent(fields)).toBe(true);
  });

  it("leaving clears on_beach_since", () => {
    const fields = applyStatus(false, new Date());
    expect(fields).toEqual({ onBeach: false, onBeachSince: null });
    expect(statusIsConsistent(fields)).toBe(true);
  });

  it("detects inconsistent states", () => {
    expect(statusIsConsistent({ onBeach: true, onBeachSince: null })).toBe(false);
    expect(
      statusIsConsistent({ onBeach: false, onBeachSince: new Date().toISOString() }),
    ).toBe(false);
  });
});
