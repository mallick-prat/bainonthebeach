"use client";

// Tiny avatar preview for lists.

import { useEffect, useRef } from "react";
import type { CharacterConfig } from "@/lib/validation/character";
import { SPRITE_H, SPRITE_W } from "@/game/sprites/characterSprites";

export function AvatarThumb({ config }: { config: CharacterConfig | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !config) return;
    let disposed = false;
    (async () => {
      const { spriteCanvas } = await import("@/game/sprites/toCanvas");
      if (disposed) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        spriteCanvas(config, "south", "idle"),
        0,
        0,
        SPRITE_W * 2,
        SPRITE_H * 2,
      );
    })();
    return () => {
      disposed = true;
    };
  }, [config]);
  return (
    <canvas
      ref={ref}
      width={SPRITE_W * 2}
      height={SPRITE_H * 2}
      className="pixelated shrink-0"
      aria-hidden
    />
  );
}
