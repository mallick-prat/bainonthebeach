// Code-drawn world art. Everything is fillRect pixel work on small canvases,
// scaled with nearest-neighbor by the renderer. Two frames where animated
// (foam, palm sway, flag). Browser-only module.

import { PAL } from "@/game/sprites/palette";
import {
  BANNER,
  BUILDING,
  GRASS,
  LOUNGERS,
  PALMS,
  SHRUBS,
  TABLES,
  TOWELS,
  UMBRELLAS,
  WORLD_H,
  WORLD_W,
  isWater,
} from "./geometry";

type Ctx = CanvasRenderingContext2D;

function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

/** Deterministic speckle so the ground is identical on every client. */
function speckle(x: number, y: number, mod: number): boolean {
  const n = (x * 374761393 + y * 668265263) ^ ((x * 31 + y * 7) << 3);
  return ((n >>> 0) % mod) === 0;
}

/* ------------------------------------------------------------------ */
/* Ground: sand, water, grass. 480x300, two frames.                    */
/* ------------------------------------------------------------------ */

/** Land mask + chamfer distance maps, computed once and shared. */
let masks: { land: Uint8Array; distToLand: Float32Array; distToWater: Float32Array } | null =
  null;

function chamfer(seed: (i: number) => boolean): Float32Array {
  const dist = new Float32Array(WORLD_W * WORLD_H).fill(1e6);
  for (let i = 0; i < dist.length; i++) if (seed(i)) dist[i] = 0;
  // Two-pass 8-neighbour chamfer (chebyshev-ish distances, plenty here).
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const i = y * WORLD_W + x;
      if (x > 0) dist[i] = Math.min(dist[i]!, dist[i - 1]! + 1);
      if (y > 0) {
        dist[i] = Math.min(dist[i]!, dist[i - WORLD_W]! + 1);
        if (x > 0) dist[i] = Math.min(dist[i]!, dist[i - WORLD_W - 1]! + 1);
        if (x < WORLD_W - 1) dist[i] = Math.min(dist[i]!, dist[i - WORLD_W + 1]! + 1);
      }
    }
  }
  for (let y = WORLD_H - 1; y >= 0; y--) {
    for (let x = WORLD_W - 1; x >= 0; x--) {
      const i = y * WORLD_W + x;
      if (x < WORLD_W - 1) dist[i] = Math.min(dist[i]!, dist[i + 1]! + 1);
      if (y < WORLD_H - 1) {
        dist[i] = Math.min(dist[i]!, dist[i + WORLD_W]! + 1);
        if (x < WORLD_W - 1) dist[i] = Math.min(dist[i]!, dist[i + WORLD_W + 1]! + 1);
        if (x > 0) dist[i] = Math.min(dist[i]!, dist[i + WORLD_W - 1]! + 1);
      }
    }
  }
  return dist;
}

function coastMasks() {
  if (masks) return masks;
  const land = new Uint8Array(WORLD_W * WORLD_H);
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      if (!isWater(x, y)) land[y * WORLD_W + x] = 1;
    }
  }
  masks = {
    land,
    distToLand: chamfer((i) => land[i] === 1),
    distToWater: chamfer((i) => land[i] === 0),
  };
  return masks;
}

export function paintGround(frame: 0 | 1): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(WORLD_W, WORLD_H);
  const { land, distToLand, distToWater } = coastMasks();

  // Deep ocean everywhere first.
  px(ctx, 0, 0, WORLD_W, WORLD_H, PAL.blue);

  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const i = y * WORLD_W + x;
      if (land[i]) {
        // Sand, with wet sand near the waterline and sparse speckles.
        if (distToWater[i]! <= 4) {
          px(ctx, x, y, 1, 1, PAL.sandDark);
        } else if (x % 2 === 0 && y % 2 === 0 && speckle(x, y, 43)) {
          px(ctx, x, y, 2, 1, PAL.sandDark);
        } else {
          px(ctx, x, y, 1, 1, PAL.sand);
        }
        continue;
      }
      const d = distToLand[i]!;
      if (d <= 2) {
        // Foam dashes hugging the whole coastline, alternating per frame.
        const on =
          frame === 0 ? (x + y) % 10 < 5 : (x + y + 5) % 10 < 5;
        px(ctx, x, y, 1, 1, on ? PAL.white : PAL.cyan);
      } else if (d <= 11) {
        px(ctx, x, y, 1, 1, PAL.cyan);
      } else if (
        // Sparse wave dashes out in the deep ocean.
        (y + (frame === 0 ? 0 : 6)) % 26 < 2 &&
        (x + y * 7) % 64 < 9 &&
        d > 18
      ) {
        px(ctx, x, y, 1, 1, PAL.cyan);
      }
    }
  }

  // Grass shelf with border, speckles, and a sand path opening at the bottom.
  px(ctx, GRASS.x, GRASS.y, GRASS.w, GRASS.h, PAL.green);
  px(ctx, GRASS.x, GRASS.y, GRASS.w, 2, PAL.greenDark);
  px(ctx, GRASS.x, GRASS.y + GRASS.h - 2, GRASS.w, 2, PAL.greenDark);
  px(ctx, GRASS.x, GRASS.y, 2, GRASS.h, PAL.greenDark);
  px(ctx, GRASS.x + GRASS.w - 2, GRASS.y, 2, GRASS.h, PAL.greenDark);
  for (let y = GRASS.y + 2; y < GRASS.y + GRASS.h - 2; y += 2) {
    for (let x = GRASS.x + 2; x < GRASS.x + GRASS.w - 2; x += 2) {
      if (speckle(x, y, 23)) px(ctx, x, y, 2, 1, PAL.greenDark);
    }
  }
  // Path opening from the office lawn down to the sand.
  px(ctx, GRASS.x + 52, GRASS.y + GRASS.h - 2, 36, 2, PAL.sand);
  px(ctx, GRASS.x + 52, GRASS.y + GRASS.h, 36, 2, PAL.sandDark);
  // Soft shadow line under the shelf.
  px(ctx, GRASS.x, GRASS.y + GRASS.h, GRASS.w, 2, PAL.sandDark);

  // Flat towels (walkable decor).
  for (const t of TOWELS) {
    const a = t.color === "cyan" ? PAL.cyan : PAL.yellow;
    for (let i = 0; i < 7; i++) {
      px(ctx, t.x, t.y + i * 2, 10, 2, i % 2 === 0 ? a : PAL.white);
    }
  }

  return canvas;
}

/* ------------------------------------------------------------------ */
/* Standing props: drawn to individual canvases, z-sorted by footY.    */
/* ------------------------------------------------------------------ */

export interface WorldProp {
  id: string;
  /** Two frames; frame 1 may be identical when the prop is static. */
  frames: [HTMLCanvasElement, HTMLCanvasElement];
  /** World position of the canvas top-left corner. */
  x: number;
  y: number;
  /** Virtual y used for z-sorting against characters. */
  footY: number;
}

const SIGN_LETTERS: Record<string, string[]> = {
  B: ["www.", "w..w", "www.", "w..w", "www."],
  A: [".ww.", "w..w", "wwww", "w..w", "w..w"],
  I: ["w", "w", "w", "w", "w"],
  N: ["w..w", "ww.w", "w.ww", "w..w", "w..w"],
  C: [".www", "w...", "w...", "w...", ".www"],
  O: [".ww.", "w..w", "w..w", "w..w", ".ww."],
  "&": [".w.", "w.w", ".w.", "w.w", ".ww"],
  " ": ["..", "..", "..", "..", ".."],
};

function paintSign(
  ctx: Ctx,
  text: string,
  ox: number,
  oy: number,
  scale: number,
  color: string = PAL.white,
) {
  let cx = ox;
  for (const ch of text) {
    const glyph = SIGN_LETTERS[ch];
    if (!glyph) continue;
    for (let y = 0; y < glyph.length; y++) {
      for (let x = 0; x < glyph[y]!.length; x++) {
        if (glyph[y]![x] === "w") {
          px(ctx, cx + x * scale, oy + y * scale, scale, scale, color);
        }
      }
    }
    cx += (glyph[0]!.length + 1) * scale;
  }
}

/**
 * The lawn banner: grey posts, white canvas, red emblem, BAIN & CO.
 * Recreated in code at world scale from the supplied pixel reference
 * (docs/reference/banner-reference.md).
 */
function paintBanner(): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(40, 22);
  // Posts with feet.
  px(ctx, 0, 0, 2, 20, PAL.charcoal);
  px(ctx, 38, 0, 2, 20, PAL.charcoal);
  px(ctx, 0, 20, 4, 2, PAL.charcoal);
  px(ctx, 36, 20, 4, 2, PAL.charcoal);
  // Top rail.
  px(ctx, 0, 0, 40, 2, PAL.charcoal);
  // Banner canvas.
  px(ctx, 2, 2, 36, 16, PAL.white);
  px(ctx, 2, 17, 36, 1, PAL.sandDark);
  // Emblem: red ring with a wedge, centered top.
  px(ctx, 18, 3, 4, 1, PAL.bainRed);
  px(ctx, 17, 4, 1, 1, PAL.bainRed);
  px(ctx, 22, 4, 1, 1, PAL.bainRed);
  px(ctx, 16, 5, 1, 3, PAL.bainRed);
  px(ctx, 23, 5, 1, 3, PAL.bainRed);
  px(ctx, 17, 8, 1, 1, PAL.bainRed);
  px(ctx, 22, 8, 1, 1, PAL.bainRed);
  px(ctx, 18, 9, 4, 1, PAL.bainRed);
  px(ctx, 19, 5, 2, 1, PAL.bainRed); // wedge
  px(ctx, 18, 6, 4, 1, PAL.bainRed);
  // Text ("BAIN&CO" fits the 36px canvas; spaces would overflow it).
  paintSign(ctx, "BAIN&CO", 4, 11, 1, PAL.bainRed);
  return canvas;
}

function paintBuilding(frame: 0 | 1): HTMLCanvasElement {
  const w = BUILDING.w + 4; // roof overhang
  const h = BUILDING.h + 10; // flag headroom
  const [canvas, ctx] = makeCanvas(w, h);
  const wallY = 10;
  // Walls.
  px(ctx, 2, wallY, BUILDING.w, BUILDING.h, PAL.white);
  px(ctx, 2, wallY, 2, BUILDING.h, PAL.sandDark);
  px(ctx, 2 + BUILDING.w - 2, wallY, 2, BUILDING.h, PAL.sandDark);
  px(ctx, 2, wallY + BUILDING.h - 2, BUILDING.w, 2, PAL.sandDark);
  // Flat roof with overhang.
  px(ctx, 0, wallY - 4, w, 6, PAL.charcoal);
  // Red sign band with BAIN.
  const signW = 48;
  const signX = Math.floor((w - signW) / 2);
  px(ctx, signX, wallY + 4, signW, 14, PAL.bainRed);
  paintSign(ctx, "BAIN", signX + 5, wallY + 6, 2);
  // Windows.
  for (let i = 0; i < 4; i++) {
    const wx = 8 + i * 21;
    px(ctx, wx, wallY + 24, 10, 10, PAL.charcoal);
    px(ctx, wx + 1, wallY + 25, 8, 8, PAL.cyan);
    px(ctx, wx + 4, wallY + 25, 1, 8, PAL.charcoal);
    px(ctx, wx + 1, wallY + 29, 8, 1, PAL.charcoal);
  }
  // Door.
  const doorX = Math.floor(w / 2) - 5;
  px(ctx, doorX, wallY + BUILDING.h - 16, 10, 16, PAL.wood);
  px(ctx, doorX + 7, wallY + BUILDING.h - 9, 2, 2, PAL.charcoal);
  // Roof flag: pole plus a pennant that flips per frame.
  px(ctx, w - 10, 0, 1, 10, PAL.charcoal);
  if (frame === 0) {
    px(ctx, w - 9, 1, 6, 3, PAL.red);
    px(ctx, w - 9, 4, 4, 1, PAL.red);
  } else {
    px(ctx, w - 9, 1, 5, 3, PAL.red);
    px(ctx, w - 9, 4, 6, 1, PAL.red);
  }
  return canvas;
}

function paintPalm(frame: 0 | 1): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(30, 30);
  const sway = frame === 0 ? 0 : 1;
  // Trunk with a slight bend and a notch.
  px(ctx, 14, 23, 3, 7, PAL.wood);
  px(ctx, 13, 17, 3, 7, PAL.wood);
  px(ctx, 12, 12, 3, 6, PAL.wood);
  px(ctx, 13, 21, 1, 2, PAL.charcoal);
  px(ctx, 15, 26, 1, 2, PAL.charcoal);
  // Crown: a full leafy mass...
  px(ctx, 8 + sway, 6, 14, 5, PAL.green);
  px(ctx, 10 + sway, 4, 10, 3, PAL.green);
  // ...with six drooping fronds.
  px(ctx, 3 + sway, 8, 6, 2, PAL.green);
  px(ctx, 1 + sway, 10, 4, 2, PAL.green);
  px(ctx, 21 + sway, 8, 6, 2, PAL.green);
  px(ctx, 25 + sway, 10, 4, 2, PAL.green);
  px(ctx, 5 + sway, 4, 5, 2, PAL.green);
  px(ctx, 3 + sway, 2, 4, 2, PAL.green);
  px(ctx, 20 + sway, 4, 5, 2, PAL.green);
  px(ctx, 23 + sway, 2, 4, 2, PAL.green);
  px(ctx, 6 + sway, 11, 5, 2, PAL.green);
  px(ctx, 4 + sway, 13, 3, 2, PAL.green);
  px(ctx, 19 + sway, 11, 5, 2, PAL.green);
  px(ctx, 23 + sway, 13, 3, 2, PAL.green);
  // Dark tips and inner shading for depth.
  px(ctx, 1 + sway, 11, 3, 1, PAL.greenDark);
  px(ctx, 26 + sway, 11, 3, 1, PAL.greenDark);
  px(ctx, 3 + sway, 2, 2, 1, PAL.greenDark);
  px(ctx, 25 + sway, 2, 2, 1, PAL.greenDark);
  px(ctx, 4 + sway, 14, 3, 1, PAL.greenDark);
  px(ctx, 23 + sway, 14, 3, 1, PAL.greenDark);
  px(ctx, 10 + sway, 9, 10, 2, PAL.greenDark);
  // Coconuts hanging under the crown.
  px(ctx, 10, 10, 3, 3, PAL.wood);
  px(ctx, 17, 11, 3, 3, PAL.wood);
  return canvas;
}

function paintUmbrella(color: "red" | "yellow"): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(24, 24);
  const main = color === "red" ? PAL.red : PAL.yellow;
  // Shadow on the sand.
  px(ctx, 4, 21, 16, 2, PAL.sandDark);
  // Pole.
  px(ctx, 11, 8, 2, 14, PAL.charcoal);
  // Canopy: stepped semicircle with vertical stripes.
  const rows: Array<[number, number]> = [
    [9, 6],
    [6, 12],
    [4, 16],
    [2, 20],
    [1, 22],
  ];
  rows.forEach(([ox, w], i) => {
    for (let x = 0; x < w; x++) {
      const stripe = Math.floor((ox + x) / 4) % 2 === 0;
      px(ctx, ox + x, 2 + i, 1, 1, stripe ? main : PAL.white);
    }
  });
  px(ctx, 11, 0, 2, 2, PAL.charcoal); // finial
  return canvas;
}

function paintLounger(color: "cyan" | "white"): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(16, 13);
  const fabric = color === "cyan" ? PAL.cyan : PAL.white;
  // Backrest (raised).
  px(ctx, 1, 0, 5, 2, PAL.wood);
  px(ctx, 2, 2, 5, 2, fabric);
  // Seat.
  px(ctx, 3, 4, 11, 3, fabric);
  px(ctx, 3, 7, 11, 2, PAL.wood);
  // Legs.
  px(ctx, 4, 9, 2, 4, PAL.wood);
  px(ctx, 11, 9, 2, 4, PAL.wood);
  return canvas;
}

function paintTable(): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(18, 15);
  // Tabletop.
  px(ctx, 0, 4, 18, 5, PAL.wood);
  px(ctx, 0, 8, 18, 1, PAL.charcoal);
  // Legs.
  px(ctx, 2, 9, 2, 6, PAL.wood);
  px(ctx, 14, 9, 2, 6, PAL.wood);
  // Laptop: the visual joke.
  px(ctx, 3, 0, 7, 4, PAL.charcoal);
  px(ctx, 4, 1, 5, 3, PAL.cyan);
  px(ctx, 3, 4, 8, 1, PAL.white);
  // A tiny abandoned page.
  px(ctx, 13, 2, 3, 2, PAL.white);
  return canvas;
}

function paintShrub(): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(12, 9);
  px(ctx, 2, 2, 8, 6, PAL.green);
  px(ctx, 1, 4, 10, 3, PAL.green);
  px(ctx, 4, 1, 4, 2, PAL.green);
  px(ctx, 3, 3, 2, 1, PAL.greenDark);
  px(ctx, 7, 5, 2, 1, PAL.greenDark);
  px(ctx, 5, 6, 1, 1, PAL.greenDark);
  return canvas;
}

let propsCache: WorldProp[] | null = null;

export function worldProps(): WorldProp[] {
  if (propsCache) return propsCache;
  const props: WorldProp[] = [];

  const b0 = paintBuilding(0);
  const b1 = paintBuilding(1);
  props.push({
    id: "building",
    frames: [b0, b1],
    x: BUILDING.x - 2,
    y: BUILDING.y - 10,
    footY: BUILDING.y + BUILDING.h,
  });

  const banner = paintBanner();
  props.push({
    id: "banner",
    frames: [banner, banner],
    x: BANNER.x,
    y: BANNER.y,
    footY: BANNER.y + BANNER.h,
  });

  PALMS.forEach((p, i) => {
    const f0 = paintPalm(0);
    const f1 = paintPalm(1);
    props.push({
      id: `palm-${i}`,
      frames: [f0, f1],
      x: p.x - 15,
      y: p.y - 28,
      footY: p.y + 2,
    });
  });

  UMBRELLAS.forEach((u, i) => {
    const c = paintUmbrella(u.color);
    props.push({
      id: `umbrella-${i}`,
      frames: [c, c],
      x: u.x - 12,
      y: u.y - 20,
      footY: u.y + 3,
    });
  });

  LOUNGERS.forEach((l, i) => {
    const c = paintLounger(l.color);
    props.push({
      id: `lounger-${i}`,
      frames: [c, c],
      x: l.x - 8,
      y: l.y - 9,
      footY: l.y + 4,
    });
  });

  TABLES.forEach((t, i) => {
    const c = paintTable();
    props.push({
      id: `table-${i}`,
      frames: [c, c],
      x: t.x - 9,
      y: t.y - 11,
      footY: t.y + 4,
    });
  });

  SHRUBS.forEach((s, i) => {
    const c = paintShrub();
    props.push({
      id: `shrub-${i}`,
      frames: [c, c],
      x: s.x - 6,
      y: s.y - 7,
      footY: s.y + 2,
    });
  });

  propsCache = props;
  return props;
}
