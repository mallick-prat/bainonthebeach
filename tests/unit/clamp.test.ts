import { describe, expect, it } from "vitest";
import { clampLabel } from "@/lib/ui/clamp";

describe("label clamping", () => {
  const W = 800;
  const H = 600;

  it("centers above the anchor with room", () => {
    const p = clampLabel(400, 300, 140, 40, W, H);
    expect(p.below).toBe(false);
    expect(p.x).toBe(400 - 70);
    expect(p.y).toBe(300 - 46);
  });

  it("clamps at the left and right edges", () => {
    expect(clampLabel(5, 300, 140, 40, W, H).x).toBe(4);
    expect(clampLabel(W - 5, 300, 140, 40, W, H).x).toBe(W - 140 - 4);
  });

  it("flips below near the top edge", () => {
    const p = clampLabel(400, 20, 140, 40, W, H);
    expect(p.below).toBe(true);
    expect(p.y).toBe(30);
  });

  it("never leaves the viewport", () => {
    for (const [ax, ay] of [
      [0, 0],
      [W, 0],
      [0, H],
      [W, H],
      [W / 2, H / 2],
    ]) {
      const p = clampLabel(ax!, ay!, 140, 40, W, H);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + 140).toBeLessThanOrEqual(W);
      expect(p.y + 40).toBeLessThanOrEqual(H);
    }
  });
});
