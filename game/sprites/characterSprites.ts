// Original code-authored paper-doll pixel character system.
// Grids are 16 columns wide ASCII art. The compositor resolves tokens to
// palette colors from a CharacterConfig, applies style transforms, stacks
// overlays in an explicit per-direction z-order, then draws a 1px outer
// outline. Pure pixel math lives here (testable in Node); canvas conversion
// is in ./toCanvas.ts.

import type { CharacterConfig } from "@/lib/validation/character";
import {
  CLOTH_COLORS,
  HAIR_COLORS,
  PAL,
  SKIN_SHADES,
  SKIN_TONES,
} from "./palette";

export type Direction = "south" | "north" | "east" | "west";
export type Pose = "idle" | "walkA" | "walkB";

// Sprite canvas: 20 wide x 28 tall. Body grid (16x18) sits at (2, 8).
// Foot baseline is row 25. Rows 2..7 are headroom for hair and hats.
export const SPRITE_W = 20;
export const SPRITE_H = 28;
export const BODY_X = 2;
export const BODY_Y = 8;
export const FOOT_BASELINE = 25;

/* ------------------------------------------------------------------ */
/* Body grids: tokens                                                  */
/*   .  transparent      s skin        d skin shade    e eye           */
/*   t  top color        b bottom      L lower leg     F foot          */
/* ------------------------------------------------------------------ */

const SOUTH_HEAD = [
  ".....ssssss.....",
  "....ssssssss....",
  "....ssssssss....",
  "....ssessess....",
  "....ssssssss....",
  ".....dddddd.....",
];

const NORTH_HEAD = [
  ".....ssssss.....",
  "....ssssssss....",
  "....ssssssss....",
  "....ssssssss....",
  "....ssssssss....",
  ".....dddddd.....",
];

const FRONT_TORSO = [
  "...tttttttttt...",
  "..tttttttttttt..",
  "..tttttttttttt..",
  "..tttttttttttt..",
  "..stttttttttts..",
  "...tttttttttt...",
];

const FRONT_HIPS = ["...bbbbbbbbbb...", "...bbbbbbbbbb..."];

const FRONT_LEGS_IDLE = [
  "...bbbb..bbbb...",
  "...bbbb..bbbb...",
  "...LLLL..LLLL...",
  "...FFFF..FFFF...",
];

const FRONT_LEGS_A = [
  "...bbbb..bbbb...",
  "...bbbb..bbbb...",
  "...FFFF..LLLL...",
  ".........FFFF...",
];

const FRONT_LEGS_B = [
  "...bbbb..bbbb...",
  "...bbbb..bbbb...",
  "...LLLL..FFFF...",
  "...FFFF.........",
];

const EAST_HEAD = [
  ".....ssssss.....",
  "....ssssssss....",
  "....ssssssss....",
  "....sssssses....",
  "....ssssssss....",
  ".....dddddd.....",
];

const EAST_TORSO = [
  "....tttttttt....",
  "...tttttttttt...",
  "...tttttttttt...",
  "...tttttttttt...",
  "...ttttttttts...",
  "....tttttttt....",
];

const EAST_HIPS = ["....bbbbbbbb....", "....bbbbbbbb...."];

const EAST_LEGS_IDLE = [
  ".....bbbbbb.....",
  ".....bbbbbb.....",
  ".....LLLLLL.....",
  ".....FFFFFFF....",
];

const EAST_LEGS_A = [
  ".....bbbbbb.....",
  "....bbb..bbb....",
  "...LLL....LLL...",
  "..FFF......FFF..",
];

const EAST_LEGS_B = [
  ".....bbbbbb.....",
  ".....bbbbbb.....",
  ".....LLLLLL.....",
  "....FFFFFF......",
];

function bodyGrid(dir: "south" | "north" | "east", pose: Pose): string[] {
  const legs =
    dir === "east"
      ? pose === "idle"
        ? EAST_LEGS_IDLE
        : pose === "walkA"
          ? EAST_LEGS_A
          : EAST_LEGS_B
      : pose === "idle"
        ? FRONT_LEGS_IDLE
        : pose === "walkA"
          ? FRONT_LEGS_A
          : FRONT_LEGS_B;
  if (dir === "east")
    return [...EAST_HEAD, ...EAST_TORSO, ...EAST_HIPS, ...legs];
  const head = dir === "south" ? SOUTH_HEAD : NORTH_HEAD;
  return [...head, ...FRONT_TORSO, ...FRONT_HIPS, ...legs];
}

/* ------------------------------------------------------------------ */
/* Overlays: hair, accessories, props.                                 */
/* Each overlay is rows of tokens anchored at body-grid coordinates.   */
/* dy is relative to the body grid top (negative rows sit above it).   */
/* ------------------------------------------------------------------ */

interface Overlay {
  dy: number;
  rows: string[];
  z: "behind" | "front";
}

type DirKey = "south" | "north" | "east";

const HAIR: Record<string, Partial<Record<DirKey, Overlay>>> = {
  none: {},
  short: {
    south: {
      dy: -1,
      z: "front",
      rows: [".....hhhhhh.....", "....hhhhhhhh....", "....hh....hh...."],
    },
    north: {
      dy: -1,
      z: "front",
      rows: [
        ".....hhhhhh.....",
        "....hhhhhhhh....",
        "....hhhhhhhh....",
        "....hhhhhhhh....",
        "....hhhhhhhh....",
      ],
    },
    east: {
      dy: -1,
      z: "front",
      rows: [
        ".....hhhhhh.....",
        "....hhhhhhhh....",
        "....hhhhhh......",
        "....hhh.........",
        "....hh..........",
      ],
    },
  },
  spiky: {
    south: {
      dy: -2,
      z: "front",
      rows: [
        "....h.h..h.h....",
        ".....hhhhhh.....",
        "....hhhhhhhh....",
        "....hh....hh....",
      ],
    },
    north: {
      dy: -2,
      z: "front",
      rows: [
        "....h.h..h.h....",
        ".....hhhhhh.....",
        "....hhhhhhhh....",
        "....hhhhhhhh....",
        "....hhhhhhhh....",
        "....hhhhhhhh....",
      ],
    },
    east: {
      dy: -2,
      z: "front",
      rows: [
        "....h.h..h.h....",
        ".....hhhhhh.....",
        "....hhhhhhhh....",
        "....hhhh........",
        "....hh..........",
      ],
    },
  },
  bob: {
    south: {
      dy: -1,
      z: "front",
      rows: [
        ".....hhhhhh.....",
        "....hhhhhhhh....",
        "...hhh....hhh...",
        "...hhh....hhh...",
        "...hhh....hhh...",
        "...hh......hh...",
      ],
    },
    north: {
      dy: -1,
      z: "front",
      rows: [
        ".....hhhhhh.....",
        "...hhhhhhhhhh...",
        "...hhhhhhhhhh...",
        "...hhhhhhhhhh...",
        "...hhhhhhhhhh...",
        "...hhhhhhhhhh...",
      ],
    },
    east: {
      dy: -1,
      z: "front",
      rows: [
        ".....hhhhhh.....",
        "....hhhhhhhh....",
        "...hhhhhh.......",
        "...hhhh.........",
        "...hhhh.........",
        "...hhh..........",
      ],
    },
  },
  long: {
    south: {
      dy: -1,
      z: "front",
      rows: [
        ".....hhhhhh.....",
        "....hhhhhhhh....",
        "...hhh....hhh...",
        "...hhh....hhh...",
        "...hhh....hhh...",
        "...hhh....hhh...",
        "...hhh....hhh...",
        "...hhh....hhh...",
      ],
    },
    north: {
      dy: -1,
      z: "front",
      rows: [
        ".....hhhhhh.....",
        "...hhhhhhhhhh...",
        "...hhhhhhhhhh...",
        "...hhhhhhhhhh...",
        "...hhhhhhhhhh...",
        "...hhhhhhhhhh...",
        "...hhhhhhhhhh...",
        "....hhhhhhhh....",
      ],
    },
    east: {
      dy: -1,
      z: "front",
      rows: [
        ".....hhhhhh.....",
        "....hhhhhhhh....",
        "...hhhhhh.......",
        "...hhhh.........",
        "...hhhh.........",
        "...hhhh.........",
        "...hhhh.........",
        "...hhh..........",
      ],
    },
  },
  bun: {
    south: {
      dy: -3,
      z: "front",
      rows: [
        ".......hh.......",
        "......hhhh......",
        ".....hhhhhh.....",
        "....hhhhhhhh....",
        "....hh....hh....",
      ],
    },
    north: {
      dy: -3,
      z: "front",
      rows: [
        ".......hh.......",
        "......hhhh......",
        ".....hhhhhh.....",
        "....hhhhhhhh....",
        "....hhhhhhhh....",
        "....hhhhhhhh....",
      ],
    },
    east: {
      dy: -3,
      z: "front",
      rows: [
        "...hh...........",
        "..hhhh..........",
        ".....hhhhhh.....",
        "....hhhhhhhh....",
        "....hhh.........",
        "....hh..........",
      ],
    },
  },
};

const ACCESSORY: Record<string, Partial<Record<DirKey, Overlay>>> = {
  none: {},
  visor: {
    south: {
      dy: 0,
      z: "front",
      rows: ["....wwwwwwww....", "..wwwwwwwwwwww.."],
    },
    north: { dy: 0, z: "front", rows: ["....wwwwwwww...."] },
    east: { dy: 0, z: "front", rows: ["....wwwwwwww....", "......wwwwwwww.."] },
  },
  strawhat: {
    south: {
      dy: -3,
      z: "front",
      rows: [
        ".....yyyyyy.....",
        "....yyyyyyyy....",
        "..yyyyyyyyyyyy..",
        ".yyyyyyyyyyyyyy.",
      ],
    },
    north: {
      dy: -3,
      z: "front",
      rows: [
        ".....yyyyyy.....",
        "....yyyyyyyy....",
        "..yyyyyyyyyyyy..",
        ".yyyyyyyyyyyyyy.",
      ],
    },
    east: {
      dy: -3,
      z: "front",
      rows: [
        ".....yyyyyy.....",
        "....yyyyyyyy....",
        "..yyyyyyyyyyyy..",
        ".yyyyyyyyyyyyyy.",
      ],
    },
  },
  sunglasses: {
    south: { dy: 3, z: "front", rows: ["...kkkkkkkkkk..."] },
    east: { dy: 3, z: "front", rows: [".......kkkkkkk.."] },
  },
  snorkel: {
    south: {
      dy: 0,
      z: "front",
      rows: [
        "..............cc",
        "..............cc",
        "....cccccccc..cc",
        "..............cc",
      ],
    },
    north: {
      dy: 0,
      z: "front",
      rows: [
        "..............cc",
        "..............cc",
        "....cccccccc..cc",
        "..............cc",
      ],
    },
    east: {
      dy: 0,
      z: "front",
      rows: [
        ".............cc.",
        ".............cc.",
        "....cccccc...cc.",
        ".............cc.",
      ],
    },
  },
  tie: {
    south: {
      dy: 6,
      z: "front",
      rows: [
        ".......rr.......",
        ".......rr.......",
        ".......rr.......",
        ".......rr.......",
        "........r.......",
      ],
    },
    east: {
      dy: 6,
      z: "front",
      rows: ["..........r.....", "..........r.....", "..........r....."],
    },
  },
  floatring: {
    south: {
      dy: 11,
      z: "front",
      rows: [".aawwaaaaaawwaa.", ".aawwaaaaaawwaa."],
    },
    north: {
      dy: 11,
      z: "front",
      rows: [".aawwaaaaaawwaa.", ".aawwaaaaaawwaa."],
    },
    east: {
      dy: 11,
      z: "front",
      rows: ["..aawwaaaawwaa..", "..aawwaaaawwaa.."],
    },
  },
};

const PROP: Record<string, Partial<Record<DirKey, Overlay>>> = {
  none: {},
  laptop: {
    south: {
      dy: 8,
      z: "front",
      rows: [".....wwwwww.....", ".....wccccw.....", ".....wwwwww....."],
    },
    east: {
      dy: 8,
      z: "front",
      rows: ["..........wwww..", "..........wccw..", "..........wwww.."],
    },
  },
  drink: {
    south: {
      dy: 8,
      z: "front",
      rows: [".............a..", "............yy..", "............yy.."],
    },
    east: {
      dy: 8,
      z: "front",
      rows: ["............a...", "...........yy...", "...........yy..."],
    },
  },
  surfboard: {
    south: {
      dy: -2,
      z: "behind",
      rows: [
        "..............ww",
        ".............www",
        ".............wcw",
        ".............wcw",
        ".............wcw",
        ".............wcw",
        ".............wcw",
        ".............wcw",
        ".............wcw",
        ".............wcw",
        ".............wcw",
        ".............wcw",
        ".............www",
        "..............ww",
      ],
    },
    north: {
      dy: -2,
      z: "front",
      rows: [
        "..............ww",
        ".............www",
        ".............wcw",
        ".............wcw",
        ".............wcw",
        ".............wcw",
        ".............wcw",
        ".............wcw",
        ".............wcw",
        ".............wcw",
        ".............wcw",
        ".............wcw",
        ".............www",
        "..............ww",
      ],
    },
    east: {
      dy: -2,
      z: "behind",
      rows: [
        ".ww.............",
        "www.............",
        "wcw.............",
        "wcw.............",
        "wcw.............",
        "wcw.............",
        "wcw.............",
        "wcw.............",
        "wcw.............",
        "wcw.............",
        "wcw.............",
        "wcw.............",
        "www.............",
        ".ww.............",
      ],
    },
  },
  tote: {
    south: {
      dy: 10,
      z: "front",
      rows: [
        ".y..............",
        "yyy.............",
        "yyy.............",
        "yyy.............",
      ],
    },
    north: {
      dy: 10,
      z: "behind",
      rows: [
        ".y..............",
        "yyy.............",
        "yyy.............",
        "yyy.............",
      ],
    },
    east: {
      dy: 10,
      z: "front",
      rows: [
        "............y...",
        "...........yyy..",
        "...........yyy..",
        "...........yyy..",
      ],
    },
  },
  beachball: {
    south: {
      dy: 14,
      z: "front",
      rows: [
        "............rrww",
        "............rrww",
        "............wwbb",
        "............wwbb",
      ],
    },
    north: {
      dy: 14,
      z: "front",
      rows: [
        "............rrww",
        "............rrww",
        "............wwbb",
        "............wwbb",
      ],
    },
    east: {
      dy: 14,
      z: "front",
      rows: [
        ".............rrw",
        ".............rrw",
        ".............wbb",
        ".............wbb",
      ],
    },
  },
  towel: {
    south: {
      dy: 8,
      z: "front",
      rows: [
        "cc..............",
        "ww..............",
        "cc..............",
        "ww..............",
      ],
    },
    north: {
      dy: 8,
      z: "behind",
      rows: [
        "cc..............",
        "ww..............",
        "cc..............",
        "ww..............",
      ],
    },
    east: {
      dy: 8,
      z: "behind",
      rows: [
        "...cc...........",
        "...ww...........",
        "...cc...........",
        "...ww...........",
      ],
    },
  },
};

/* ------------------------------------------------------------------ */
/* Style transforms applied to the body grid before painting.          */
/* ------------------------------------------------------------------ */

// tank top: bare shoulders/arms (convert outer torso columns to skin).
const TANK_COLS_FRONT = [2, 3, 12, 13];
const TANK_COLS_EAST = [3, 4, 11, 12];

// button-up: collar + buttons drawn as white 'u' cells [x, y].
const BUTTONUP_FRONT: Array<[number, number]> = [
  [6, 6],
  [9, 6],
  [7, 8],
  [8, 8],
  [7, 10],
  [8, 10],
];
const BUTTONUP_EAST: Array<[number, number]> = [
  [9, 6],
  [10, 6],
  [10, 8],
  [10, 10],
];

// trunks: white side stripe on the hips rows.
const TRUNKS_FRONT: Array<[number, number]> = [
  [3, 12],
  [3, 13],
  [12, 12],
  [12, 13],
];
const TRUNKS_EAST: Array<[number, number]> = [
  [4, 12],
  [4, 13],
];

function applyStyles(
  grid: string[],
  dir: DirKey,
  cfg: CharacterConfig,
): string[][] {
  const cells = grid.map((row) => row.split(""));
  const isEast = dir === "east";
  if (cfg.topStyle === "tank") {
    const cols = isEast ? TANK_COLS_EAST : TANK_COLS_FRONT;
    for (let y = 6; y <= 10; y++) {
      for (const x of cols) {
        if (cells[y]?.[x] === "t") cells[y]![x] = "s";
      }
    }
  }
  if (cfg.topStyle === "buttonup") {
    for (const [x, y] of isEast ? BUTTONUP_EAST : BUTTONUP_FRONT) {
      if (cells[y]?.[x] === "t") cells[y]![x] = "u";
    }
  }
  if (cfg.bottomStyle === "trunks") {
    for (const [x, y] of isEast ? TRUNKS_EAST : TRUNKS_FRONT) {
      if (cells[y]?.[x] === "b") cells[y]![x] = "u";
    }
  }
  return cells;
}

/* ------------------------------------------------------------------ */
/* Token resolution                                                    */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function tokenColor(token: string, cfg: CharacterConfig): string | null {
  switch (token) {
    case "s":
      return SKIN_TONES[cfg.skin] ?? SKIN_TONES[0];
    case "d":
      return SKIN_SHADES[cfg.skin] ?? SKIN_SHADES[0];
    case "e":
      return PAL.charcoal;
    case "t":
      return CLOTH_COLORS[cfg.topColor] ?? CLOTH_COLORS[0];
    case "u":
      return PAL.white;
    case "b":
      return CLOTH_COLORS[cfg.bottomColor] ?? CLOTH_COLORS[0];
    case "L":
      return cfg.bottomStyle === "pants"
        ? (CLOTH_COLORS[cfg.bottomColor] ?? CLOTH_COLORS[0])
        : (SKIN_TONES[cfg.skin] ?? SKIN_TONES[0]);
    case "F":
      return cfg.shoes === "sneakers"
        ? PAL.white
        : cfg.shoes === "barefoot"
          ? (SKIN_TONES[cfg.skin] ?? SKIN_TONES[0])
          : PAL.wood;
    case "h":
      return HAIR_COLORS[cfg.hairColor] ?? HAIR_COLORS[0];
    case "w":
      return PAL.white;
    case "y":
      return PAL.yellow;
    case "k":
      return PAL.charcoal;
    case "c":
      return PAL.cyan;
    case "r":
      return PAL.red;
    case "a":
      return PAL.orange;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Compositor                                                          */
/* ------------------------------------------------------------------ */

export interface SpritePixels {
  width: number;
  height: number;
  /** RGBA, row-major. */
  data: Uint8ClampedArray;
}

function paintRows(
  out: Uint8ClampedArray,
  rows: ArrayLike<string | string[]>,
  ox: number,
  oy: number,
  cfg: CharacterConfig,
) {
  for (let ry = 0; ry < rows.length; ry++) {
    const row = rows[ry]!;
    for (let rx = 0; rx < row.length; rx++) {
      const token = typeof row === "string" ? row[rx]! : row[rx]!;
      if (token === ".") continue;
      const color = tokenColor(token, cfg);
      if (!color) continue;
      const x = ox + rx;
      const y = oy + ry;
      if (x < 0 || y < 0 || x >= SPRITE_W || y >= SPRITE_H) continue;
      const idx = (y * SPRITE_W + x) * 4;
      const [r, g, b] = hexToRgb(color);
      out[idx] = r;
      out[idx + 1] = g;
      out[idx + 2] = b;
      out[idx + 3] = 255;
    }
  }
}

const OUTLINE_RGB = hexToRgb(PAL.black);

function addOutline(px: SpritePixels, colorRgb: [number, number, number]) {
  const { width, height, data } = px;
  const alphaAt = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height
      ? data[(y * width + x) * 4 + 3]!
      : 0;
  const outlined: Array<[number, number]> = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alphaAt(x, y) !== 0) continue;
      if (
        alphaAt(x - 1, y) > 0 ||
        alphaAt(x + 1, y) > 0 ||
        alphaAt(x, y - 1) > 0 ||
        alphaAt(x, y + 1) > 0
      ) {
        outlined.push([x, y]);
      }
    }
  }
  for (const [x, y] of outlined) {
    const idx = (y * width + x) * 4;
    data[idx] = colorRgb[0];
    data[idx + 1] = colorRgb[1];
    data[idx + 2] = colorRgb[2];
    data[idx + 3] = 255;
  }
}

function mirrorHorizontal(px: SpritePixels): SpritePixels {
  const { width, height, data } = px;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = (y * width + (width - 1 - x)) * 4;
      out[dst] = data[src]!;
      out[dst + 1] = data[src + 1]!;
      out[dst + 2] = data[src + 2]!;
      out[dst + 3] = data[src + 3]!;
    }
  }
  return { width, height, data: out };
}

/**
 * Composes a full character sprite. Unknown accessory/prop/hair ids simply
 * render nothing for that layer: the rest of the character still appears.
 */
export function composeSprite(
  cfg: CharacterConfig,
  dir: Direction,
  pose: Pose,
  opts: { outline?: "black" | "white" | "none" } = {},
): SpritePixels {
  const baseDir: DirKey = dir === "west" ? "east" : dir;
  const data = new Uint8ClampedArray(SPRITE_W * SPRITE_H * 4);
  const px: SpritePixels = { width: SPRITE_W, height: SPRITE_H, data };

  const overlays: Array<{ overlay: Overlay; layer: "hair" | "acc" | "prop" }> =
    [];
  const hair = HAIR[cfg.hairStyle]?.[baseDir];
  if (hair) overlays.push({ overlay: hair, layer: "hair" });
  const acc = ACCESSORY[cfg.accessory]?.[baseDir];
  if (acc) overlays.push({ overlay: acc, layer: "acc" });
  const prop = PROP[cfg.prop]?.[baseDir];
  if (prop) overlays.push({ overlay: prop, layer: "prop" });

  for (const { overlay } of overlays) {
    if (overlay.z === "behind") {
      paintRows(data, overlay.rows, BODY_X, BODY_Y + overlay.dy, cfg);
    }
  }

  const body = applyStyles(bodyGrid(baseDir, pose), baseDir, cfg);
  paintRows(
    data,
    body.map((r) => r.join("")),
    BODY_X,
    BODY_Y,
    cfg,
  );

  // hair, then accessory (hats sit over hair), then front props.
  for (const layer of ["hair", "acc", "prop"] as const) {
    for (const entry of overlays) {
      if (entry.layer !== layer || entry.overlay.z !== "front") continue;
      paintRows(
        data,
        entry.overlay.rows,
        BODY_X,
        BODY_Y + entry.overlay.dy,
        cfg,
      );
    }
  }

  const outline = opts.outline ?? "black";
  if (outline !== "none") {
    addOutline(px, outline === "white" ? hexToRgb(PAL.white) : OUTLINE_RGB);
  }

  return dir === "west" ? mirrorHorizontal(px) : px;
}

/** Stable cache key for a composed sprite variant. */
export function spriteKey(
  cfg: CharacterConfig,
  dir: Direction,
  pose: Pose,
  outline: string,
): string {
  return [
    cfg.skin,
    cfg.hairStyle,
    cfg.hairColor,
    cfg.topStyle,
    cfg.topColor,
    cfg.bottomStyle,
    cfg.bottomColor,
    cfg.shoes,
    cfg.accessory,
    cfg.prop,
    dir,
    pose,
    outline,
  ].join("|");
}
