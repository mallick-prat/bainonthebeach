// Browser-only adapter: SpritePixels -> HTMLCanvasElement, with caching.

import type { CharacterConfig } from "@/lib/validation/character";
import {
  composeSprite,
  spriteKey,
  type Direction,
  type Pose,
} from "./characterSprites";

const cache = new Map<string, HTMLCanvasElement>();
const MAX_CACHE = 600;

export function spriteCanvas(
  cfg: CharacterConfig,
  dir: Direction,
  pose: Pose,
  outline: "black" | "white" | "none" = "black",
): HTMLCanvasElement {
  const key = spriteKey(cfg, dir, pose, outline);
  const hit = cache.get(key);
  if (hit) return hit;
  const px = composeSprite(cfg, dir, pose, { outline });
  const canvas = document.createElement("canvas");
  canvas.width = px.width;
  canvas.height = px.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(
    new ImageData(
      px.data as Uint8ClampedArray<ArrayBuffer>,
      px.width,
      px.height,
    ),
    0,
    0,
  );
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, canvas);
  return canvas;
}
