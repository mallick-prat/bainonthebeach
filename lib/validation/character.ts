import { z } from "zod";
import {
  ACCESSORIES,
  BOTTOM_STYLES,
  CLOTH_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  PROPS,
  SHOE_STYLES,
  SKIN_TONES,
  TOP_STYLES,
} from "@/game/sprites/palette";

export const CHARACTER_SCHEMA_VERSION = 1;

// Shared client + server schema. strict() rejects unknown keys, which also
// covers prototype-pollution style payloads ("__proto__", "constructor").
export const characterConfigSchema = z
  .object({
    skin: z.number().int().min(0).max(SKIN_TONES.length - 1),
    hairStyle: z.enum(HAIR_STYLES),
    hairColor: z.number().int().min(0).max(HAIR_COLORS.length - 1),
    topStyle: z.enum(TOP_STYLES),
    topColor: z.number().int().min(0).max(CLOTH_COLORS.length - 1),
    bottomStyle: z.enum(BOTTOM_STYLES),
    bottomColor: z.number().int().min(0).max(CLOTH_COLORS.length - 1),
    shoes: z.enum(SHOE_STYLES),
    accessory: z.enum(ACCESSORIES),
    prop: z.enum(PROPS),
  })
  .strict();

export type CharacterConfig = z.infer<typeof characterConfigSchema>;

export const DEFAULT_CHARACTER: CharacterConfig = {
  skin: 2,
  hairStyle: "short",
  hairColor: 0,
  topStyle: "tee",
  topColor: 1,
  bottomStyle: "shorts",
  bottomColor: 2,
  shoes: "sandals",
  accessory: "none",
  prop: "none",
};

/**
 * Migrates a stored character config of any known schema version to the
 * current one. Returns null when the config cannot be understood, including
 * configs from a FUTURE schema version, which callers should treat as
 * "render a safe default and do not overwrite the stored config".
 */
export function migrateCharacterConfig(
  raw: unknown,
  version: number,
): CharacterConfig | null {
  if (!Number.isInteger(version) || version < 1) return null;
  if (version > CHARACTER_SCHEMA_VERSION) return null;
  // Version 1 is current. Future versions add cases above this line.
  const parsed = characterConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Deterministic randomize used by the RANDOMIZE button. Always valid. */
export function randomCharacter(rand: () => number = Math.random): CharacterConfig {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
  const idx = (n: number) => Math.floor(rand() * n);
  const config: CharacterConfig = {
    skin: idx(SKIN_TONES.length),
    hairStyle: pick(HAIR_STYLES),
    hairColor: idx(HAIR_COLORS.length),
    topStyle: pick(TOP_STYLES),
    topColor: idx(CLOTH_COLORS.length),
    bottomStyle: pick(BOTTOM_STYLES),
    bottomColor: idx(CLOTH_COLORS.length),
    shoes: pick(SHOE_STYLES),
    accessory: pick(ACCESSORIES),
    prop: pick(PROPS),
  };
  // Keep combinations readable: a white top over white bottoms is fine, but
  // make sure hair is never invisible against the same-color accessory band.
  if (config.accessory === "visor" && config.hairStyle === "none") {
    config.hairStyle = "short";
  }
  return config;
}
