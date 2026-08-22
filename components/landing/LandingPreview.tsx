"use client";

// Small live preview of the island on the logged-out landing page.
// Plain 2D canvas, a handful of deterministic preview characters.

import { useEffect, useRef } from "react";
import { WORLD_H, WORLD_W } from "@/game/world/geometry";
import { randomCharacter } from "@/lib/validation/character";
import { hash01 } from "@/game/movement/hash";
import {
  characterStateAt,
  staticStateFor,
  walkPose,
} from "@/game/movement/deterministic";
import { FOOT_BASELINE } from "@/game/sprites/characterSprites";

const PREVIEW_IDS = ["gull-1", "gull-2", "gull-3", "gull-4", "gull-5", "gull-6"];

export function LandingPreview() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;
    let disposed = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    (async () => {
      const [{ paintGround, worldProps }, { spriteCanvas }] = await Promise.all([
        import("@/game/world/paint"),
        import("@/game/sprites/toCanvas"),
      ]);
      if (disposed) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      const grounds = [paintGround(0), paintGround(1)];
      const props = worldProps();
      const people = PREVIEW_IDS.map((id) => {
        let i = 0;
        const rand = () => hash01(id, 900 + i++);
        return { id, config: randomCharacter(rand) };
      });

      const draw = () => {
        const t = Date.now();
        const frame = reduced ? 0 : Math.floor(t / 800) % 2;
        ctx.drawImage(grounds[frame]!, 0, 0);
        const items: Array<{ footY: number; draw: () => void }> = [];
        for (const prop of props) {
          items.push({
            footY: prop.footY,
            draw: () => ctx.drawImage(prop.frames[frame]!, prop.x, prop.y),
          });
        }
        for (const person of people) {
          const state = reduced ? staticStateFor(person.id) : characterStateAt(person.id, t);
          const sprite = spriteCanvas(person.config, state.dir, reduced ? "idle" : walkPose(state));
          items.push({
            footY: state.y,
            draw: () =>
              ctx.drawImage(
                sprite,
                Math.round(state.x) - 10,
                Math.round(state.y) - (FOOT_BASELINE + 1),
              ),
          });
        }
        items.sort((a, b) => a.footY - b.footY);
        for (const item of items) item.draw();
      };
      draw();
      if (!reduced) {
        // ~12 fps is plenty for an ambient preview; paused when hidden.
        raf = window.setInterval(() => {
          if (document.visibilityState === "visible") draw();
        }, 80);
      }
    })();

    return () => {
      disposed = true;
      if (raf) window.clearInterval(raf);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      width={WORLD_W}
      height={WORLD_H}
      className="pixelated w-full max-w-[480px] border-2 border-pxwhite/40"
      role="img"
      aria-label="Preview of the pixel island."
    />
  );
}
