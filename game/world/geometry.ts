// Pure world geometry: coordinates, blockers, coastline, walking routes.
// No canvas code here so unit tests can verify routes avoid water and props.
//
// The island is an organic blob in the middle of open ocean: a superellipse
// with a chunky, stepped coast. Land is inside the curve; everything else
// is water.

export const WORLD_W = 560;
export const WORLD_H = 400;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CircleBlocker {
  x: number;
  y: number;
  r: number;
  kind: string;
}

/** Grass shelf under the office. */
export const GRASS: Rect = { x: 113, y: 58, w: 150, h: 100 };

/** Office building footprint (walls). */
export const BUILDING: Rect = { x: 157, y: 66, w: 88, h: 56 };

/** Sponsor-style banner on the lawn, left of the building. Top-left corner. */
export const BANNER = { x: 113, y: 84, w: 40, h: 22 };

export const PALMS: Array<{ x: number; y: number }> = [
  { x: 275, y: 90 },
  { x: 131, y: 184 },
  { x: 175, y: 322 },
  { x: 355, y: 88 },
  { x: 417, y: 312 },
  { x: 470, y: 196 },
];

export const UMBRELLAS: Array<{
  x: number;
  y: number;
  color: "red" | "yellow";
}> = [
  { x: 305, y: 192, color: "red" },
  { x: 361, y: 260, color: "yellow" },
];

export const LOUNGERS: Array<{
  x: number;
  y: number;
  color: "cyan" | "white";
}> = [
  { x: 289, y: 208, color: "cyan" },
  { x: 319, y: 208, color: "white" },
  { x: 345, y: 272, color: "white" },
  { x: 375, y: 272, color: "cyan" },
];

export const TABLES: Array<{ x: number; y: number }> = [
  { x: 197, y: 222 },
  { x: 229, y: 278 },
];

export const SHRUBS: Array<{ x: number; y: number }> = [
  { x: 117, y: 282 },
  { x: 265, y: 338 },
  { x: 337, y: 338 },
  { x: 273, y: 138 },
  { x: 415, y: 170 },
  { x: 92, y: 236 },
];

/** Flat towels on the sand. Decorative and walkable on purpose. */
export const TOWELS: Array<{ x: number; y: number; color: "cyan" | "yellow" }> =
  [
    { x: 255, y: 240, color: "cyan" },
    { x: 327, y: 168, color: "yellow" },
  ];

/* ------------------------------------------------------------------ */
/* Coastline: superellipse island with a chunky stepped edge.          */
/* ------------------------------------------------------------------ */

const CX = 280;
const CY = 200;
const RX = 238;
const RY = 178;

// Per-angle inward wiggle (24 bands) so the coast is irregular but stable.
const WIGGLE = [
  0.04, 0.07, 0.03, 0.08, 0.05, 0.02, 0.06, 0.09, 0.04, 0.03, 0.07, 0.05, 0.02,
  0.08, 0.06, 0.03, 0.09, 0.05, 0.07, 0.02, 0.06, 0.04, 0.08, 0.05,
];

export function isWater(x: number, y: number): boolean {
  // Quantize to 2px blocks for a chunky pixel coast.
  const qx = Math.floor(x / 2) * 2;
  const qy = Math.floor(y / 2) * 2;
  const dx = (qx - CX) / RX;
  const dy = (qy - CY) / RY;
  const s = Math.abs(dx) ** 3 + Math.abs(dy) ** 3;
  const angle = Math.atan2(dy, dx);
  const band =
    ((Math.floor(((angle + Math.PI) / (2 * Math.PI)) * WIGGLE.length) %
      WIGGLE.length) +
      WIGGLE.length) %
    WIGGLE.length;
  return s > 1 - WIGGLE[band]!;
}

/** Circle blockers derived from standing props, for route validation. */
export function blockers(): CircleBlocker[] {
  const list: CircleBlocker[] = [];
  for (const p of PALMS) list.push({ x: p.x, y: p.y, r: 6, kind: "palm" });
  for (const u of UMBRELLAS)
    list.push({ x: u.x, y: u.y, r: 10, kind: "umbrella" });
  for (const l of LOUNGERS)
    list.push({ x: l.x, y: l.y, r: 8, kind: "lounger" });
  for (const t of TABLES) list.push({ x: t.x, y: t.y, r: 9, kind: "table" });
  for (const s of SHRUBS) list.push({ x: s.x, y: s.y, r: 5, kind: "shrub" });
  list.push({ x: BANNER.x + 8, y: BANNER.y + 18, r: 8, kind: "banner" });
  list.push({ x: BANNER.x + 32, y: BANNER.y + 18, r: 8, kind: "banner" });
  return list;
}

export function buildingRect(): Rect {
  return BUILDING;
}

/**
 * Closed walking routes (loops). Points are route node coordinates in world
 * pixels; characters interpolate between consecutive nodes and wrap.
 * Routes stay on sand/grass and clear every blocker by construction,
 * verified by tests/unit/routes.test.ts.
 */
export const ROUTES: Array<{ name: string; points: Array<[number, number]> }> =
  [
    {
      name: "big-loop",
      points: [
        [165, 175],
        [255, 168],
        [290, 158],
        [345, 145],
        [390, 170],
        [400, 220],
        [385, 285],
        [335, 294],
        [275, 292],
        [225, 296],
        [180, 278],
        [160, 225],
      ],
    },
    {
      name: "shoreline-stroll",
      points: [
        [390, 110],
        [405, 150],
        [400, 200],
        [405, 250],
        [393, 308],
        [387, 276],
        [393, 220],
        [387, 160],
        [377, 122],
      ],
    },
    {
      name: "office-commute",
      points: [
        [145, 140],
        [200, 136],
        [235, 145],
        [240, 170],
        [205, 180],
        [155, 170],
      ],
    },
    {
      name: "conversation-loop",
      points: [
        [265, 302],
        [290, 294],
        [315, 302],
        [313, 318],
        [290, 326],
        [267, 318],
      ],
    },
    {
      name: "mid-wander",
      points: [
        [245, 200],
        [270, 215],
        [277, 246],
        [255, 262],
        [227, 248],
        [223, 218],
      ],
    },
  ];

/** Distance from point p to segment ab. Used by tests and tooling. */
export function pointSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
