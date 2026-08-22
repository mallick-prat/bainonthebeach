import { describe, expect, it } from "vitest";
import {
  composeSprite,
  SPRITE_H,
  SPRITE_W,
} from "@/game/sprites/characterSprites";
import {
  DEFAULT_CHARACTER,
  randomCharacter,
  type CharacterConfig,
} from "@/lib/validation/character";

function filledCount(data: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++;
  return n;
}

describe("sprite compositor", () => {
  it("produces the fixed sprite dimensions", () => {
    const px = composeSprite(DEFAULT_CHARACTER, "south", "idle");
    expect(px.width).toBe(SPRITE_W);
    expect(px.height).toBe(SPRITE_H);
    expect(px.data.length).toBe(SPRITE_W * SPRITE_H * 4);
  });

  it("renders every direction and pose for many random configs", () => {
    for (let i = 0; i < 40; i++) {
      const config = randomCharacter();
      for (const dir of ["south", "north", "east", "west"] as const) {
        for (const pose of ["idle", "walkA", "walkB"] as const) {
          const px = composeSprite(config, dir, pose);
          expect(filledCount(px.data)).toBeGreaterThan(120);
        }
      }
    }
  });

  it("walk frames differ from each other and from idle", () => {
    const a = composeSprite(DEFAULT_CHARACTER, "south", "walkA").data.join(",");
    const b = composeSprite(DEFAULT_CHARACTER, "south", "walkB").data.join(",");
    const idle = composeSprite(DEFAULT_CHARACTER, "south", "idle").data.join(
      ",",
    );
    expect(a).not.toBe(b);
    expect(a).not.toBe(idle);
  });

  it("west is the mirror of east", () => {
    const east = composeSprite(DEFAULT_CHARACTER, "east", "idle");
    const west = composeSprite(DEFAULT_CHARACTER, "west", "idle");
    for (let y = 0; y < east.height; y++) {
      for (let x = 0; x < east.width; x++) {
        const e = (y * east.width + x) * 4;
        const w = (y * east.width + (east.width - 1 - x)) * 4;
        expect(west.data[w]).toBe(east.data[e]);
        expect(west.data[w + 3]).toBe(east.data[e + 3]);
      }
    }
  });

  it("an unknown accessory renders the rest of the character", () => {
    const broken = {
      ...DEFAULT_CHARACTER,
      accessory: "jetpack",
    } as unknown as CharacterConfig;
    const px = composeSprite(broken, "south", "idle");
    expect(filledCount(px.data)).toBeGreaterThan(120);
  });
});
