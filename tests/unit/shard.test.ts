import { describe, expect, it } from "vitest";
import { shardCount, shardFor, SINGLE_ISLAND_MAX } from "@/game/shard";

describe("island sharding", () => {
  it("one island up to the single-island max", () => {
    expect(shardCount(0)).toBe(1);
    expect(shardCount(60)).toBe(1);
    expect(shardCount(SINGLE_ISLAND_MAX)).toBe(1);
    expect(shardCount(SINGLE_ISLAND_MAX + 1)).toBeGreaterThan(1);
  });

  it("assignment is stable across calls (never changes on reload)", () => {
    for (let i = 0; i < 50; i++) {
      const id = `user-${i}`;
      expect(shardFor(id, "2026-08-22", 3)).toBe(shardFor(id, "2026-08-22", 3));
    }
  });

  it("assignment respects the shard count", () => {
    for (let i = 0; i < 200; i++) {
      const s = shardFor(`user-${i}`, "2026-08-22", 4);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(4);
    }
  });

  it("spreads users across shards", () => {
    const counts = [0, 0, 0];
    for (let i = 0; i < 300; i++) counts[shardFor(`u${i}`, "2026-08-22", 3)]!++;
    for (const c of counts) expect(c).toBeGreaterThan(50);
  });
});
