"use client";

// Live, enlarged, pixel-perfect preview with a walk loop.

import { useEffect, useRef } from "react";
import type { CharacterConfig } from "@/lib/validation/character";
import type { Direction } from "@/game/sprites/characterSprites";
import { SPRITE_H, SPRITE_W } from "@/game/sprites/characterSprites";

export function CharacterPreview({
  config,
  direction,
  scale = 6,
  animate = true,
}: {
  config: CharacterConfig;
  direction: Direction;
  scale?: number;
  animate?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer: number | undefined;
    let frame = 0;
    let disposed = false;

    (async () => {
      const { spriteCanvas } = await import("@/game/sprites/toCanvas");
      if (disposed) return;
      const draw = () => {
        const pose =
          !animate || reduced ? "idle" : frame % 2 === 0 ? "walkA" : "walkB";
        const sprite = spriteCanvas(config, direction, pose);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(sprite, 0, 0, SPRITE_W * scale, SPRITE_H * scale);
        frame++;
      };
      draw();
      if (animate && !reduced) {
        timer = window.setInterval(draw, 280);
      }
    })();

    return () => {
      disposed = true;
      if (timer) window.clearInterval(timer);
    };
  }, [config, direction, scale, animate]);

  return (
    <canvas
      ref={ref}
      width={SPRITE_W * scale}
      height={SPRITE_H * scale}
      className="pixelated"
      role="img"
      aria-label="Your character."
    />
  );
}
