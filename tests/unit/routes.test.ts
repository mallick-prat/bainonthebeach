import { describe, expect, it } from "vitest";
import {
  blockers,
  BUILDING,
  isWater,
  pointSegmentDistance,
  ROUTES,
  WORLD_H,
  WORLD_W,
} from "@/game/world/geometry";

// Characters are ~16px wide; keep route centerlines at least this margin
// away from water and blocker edges.
const WATER_MARGIN = 6;
const BLOCKER_MARGIN = 2;

function* routeSamples(points: Array<[number, number]>) {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(2, Math.ceil(len / 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      yield [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as const;
    }
  }
}

describe("walking routes avoid water and props by construction", () => {
  for (const route of ROUTES) {
    it(`${route.name} stays on land and clear of blockers`, () => {
      for (const [x, y] of routeSamples(route.points)) {
        expect(x).toBeGreaterThan(4);
        expect(x).toBeLessThan(WORLD_W - 4);
        expect(y).toBeGreaterThan(4);
        expect(y).toBeLessThan(WORLD_H - 4);
        expect(isWater(x + WATER_MARGIN, y), `water at ${x},${y}`).toBe(false);
        // Building footprint (with a small margin).
        const inBuilding =
          x > BUILDING.x - 4 &&
          x < BUILDING.x + BUILDING.w + 4 &&
          y > BUILDING.y - 4 &&
          y < BUILDING.y + BUILDING.h + 4;
        expect(inBuilding, `building at ${x},${y}`).toBe(false);
      }
      for (const b of blockers()) {
        for (let i = 0; i < route.points.length; i++) {
          const p1 = route.points[i]!;
          const p2 = route.points[(i + 1) % route.points.length]!;
          const d = pointSegmentDistance(b.x, b.y, p1[0], p1[1], p2[0], p2[1]);
          expect(
            d,
            `${route.name} seg ${i} too close to ${b.kind} at ${b.x},${b.y} (d=${d.toFixed(1)})`,
          ).toBeGreaterThanOrEqual(b.r + BLOCKER_MARGIN);
        }
      }
    });
  }

  it("routes are closed loops with enough nodes", () => {
    for (const route of ROUTES) {
      expect(route.points.length).toBeGreaterThanOrEqual(5);
    }
  });
});
