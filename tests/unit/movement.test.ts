import { describe, expect, it } from "vitest";
import { deriveMovementParams, fnv1a, hash01 } from "@/game/movement/hash";
import {
  buildTimeline,
  characterStateAt,
  facingFromVelocity,
  staticStateFor,
  walkPose,
} from "@/game/movement/deterministic";
import { ROUTES } from "@/game/world/geometry";

const IDS = [
  "11111111-2222-3333-4444-555555555555",
  "demo-user-abc",
  "another-user",
  "café-user-ünïcode",
];

describe("deterministic parameter derivation", () => {
  it("is stable for the same id", () => {
    for (const id of IDS) {
      expect(deriveMovementParams(id, ROUTES.length)).toEqual(
        deriveMovementParams(id, ROUTES.length),
      );
    }
  });

  it("stays within the allowed ranges", () => {
    for (let i = 0; i < 200; i++) {
      const p = deriveMovementParams(`user-${i}`, ROUTES.length);
      expect(p.routeIndex).toBeGreaterThanOrEqual(0);
      expect(p.routeIndex).toBeLessThan(ROUTES.length);
      expect(p.speed).toBeGreaterThanOrEqual(10);
      expect(p.speed).toBeLessThanOrEqual(16);
      expect(p.phase01).toBeGreaterThanOrEqual(0);
      expect(p.phase01).toBeLessThan(1);
    }
  });

  it("hash01 is uniform-ish and stable", () => {
    expect(hash01("abc", 1)).toBe(hash01("abc", 1));
    expect(fnv1a("abc", 1)).not.toBe(fnv1a("abc", 2));
  });
});

describe("position over time", () => {
  it("is identical for identical (id, t) on any client", () => {
    for (const id of IDS) {
      const a = characterStateAt(id, 1_700_000_123_456);
      const b = characterStateAt(id, 1_700_000_123_456);
      expect(a).toEqual(b);
    }
  });

  it("moves continuously across segments and the period wrap", () => {
    for (const id of IDS) {
      const params = deriveMovementParams(id, ROUTES.length);
      const timeline = buildTimeline(params.routeIndex, params);
      const periodMs = timeline.period * 1000;
      // Sample densely across more than a full period, incl. the wrap.
      let prev = characterStateAt(id, 0);
      for (let t = 100; t < periodMs * 1.2; t += 100) {
        const cur = characterStateAt(id, t);
        const dist = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        // Max possible movement in 100ms at max speed 16px/s is 1.6px.
        expect(dist).toBeLessThanOrEqual(2.5);
        prev = cur;
      }
    }
  });

  it("handles clock jumps and junk time without breaking", () => {
    const id = IDS[0]!;
    for (const t of [
      -5_000_000,
      0,
      Number.MAX_SAFE_INTEGER / 4,
      NaN,
      Infinity,
    ]) {
      const state = characterStateAt(id, t);
      expect(Number.isFinite(state.x)).toBe(true);
      expect(Number.isFinite(state.y)).toBe(true);
    }
  });

  it("static positions for reduced motion are stable", () => {
    for (const id of IDS) {
      expect(staticStateFor(id)).toEqual(staticStateFor(id));
      expect(staticStateFor(id).moving).toBe(false);
    }
  });
});

describe("facing and walk frames", () => {
  it("derives facing from the velocity vector", () => {
    expect(facingFromVelocity(1, 0)).toBe("east");
    expect(facingFromVelocity(-1, 0)).toBe("west");
    expect(facingFromVelocity(0, 1)).toBe("south");
    expect(facingFromVelocity(0, -1)).toBe("north");
    expect(facingFromVelocity(3, 2)).toBe("east");
    expect(facingFromVelocity(-2, -3)).toBe("north");
  });

  it("alternates walk frames with distance and idles when paused", () => {
    expect(walkPose({ x: 0, y: 0, dir: "south", moving: false, dist: 0 })).toBe(
      "idle",
    );
    expect(walkPose({ x: 0, y: 0, dir: "south", moving: true, dist: 0 })).toBe(
      "walkA",
    );
    expect(walkPose({ x: 0, y: 0, dir: "south", moving: true, dist: 8 })).toBe(
      "walkB",
    );
  });
});
