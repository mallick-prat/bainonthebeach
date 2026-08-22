// Generates the pixel cursor PNGs in public/assets/ui/.
// Original art, drawn as 12x12 pixel grids and scaled 2x to 24x24.
// Run: node scripts/gen-cursors.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const COLORS = {
  ".": [0, 0, 0, 0],
  o: [13, 13, 13, 255], // NES off-black outline
  w: [252, 252, 252, 255], // pixel white fill
  c: [0, 232, 216, 255], // pixel cyan accent
};

// Classic pixel arrow. Hotspot at the tip (1,1) in art pixels.
const ARROW = [
  "o...........",
  "oo..........",
  "owo.........",
  "owwo........",
  "owwwo.......",
  "owwwwo......",
  "owwwwwo.....",
  "owwwwwwo....",
  "owwwwooo....",
  "owwowwo.....",
  "oo.owwo.....",
  "....oo......",
];

// Pointing hand for interactive elements. Hotspot at fingertip (5,2).
const POINTER = [
  "....oo......",
  "...owwo.....",
  "...owwo.....",
  "...owwooo...",
  "...owwowwoo.",
  "oo.owwowwowo",
  "owoowwwwwwwo",
  "owwowwwwwwwo",
  ".owwwwwwwwwo",
  ".owwwwwwwwo.",
  "..owwwwwwwo.",
  "...ooooooo..",
];

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++)
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function renderGrid(grid, scale) {
  const h = grid.length;
  const w = grid[0].length;
  const out = Buffer.alloc(w * scale * h * scale * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = COLORS[grid[y][x]] ?? COLORS["."];
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const idx = ((y * scale + sy) * w * scale + x * scale + sx) * 4;
          out[idx] = r;
          out[idx + 1] = g;
          out[idx + 2] = b;
          out[idx + 3] = a;
        }
      }
    }
  }
  return encodePng(w * scale, h * scale, out);
}

const outDir = join(root, "public", "assets", "ui");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "cursor-arrow.png"), renderGrid(ARROW, 2));
writeFileSync(join(outDir, "cursor-pointer.png"), renderGrid(POINTER, 2));
console.log(
  "Wrote cursor-arrow.png and cursor-pointer.png to public/assets/ui/",
);
