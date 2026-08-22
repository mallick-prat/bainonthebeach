import { describe, expect, it } from "vitest";
import {
  CHARACTER_SCHEMA_VERSION,
  characterConfigSchema,
  DEFAULT_CHARACTER,
  migrateCharacterConfig,
  randomCharacter,
} from "@/lib/validation/character";

describe("character config validation", () => {
  it("accepts the default character", () => {
    expect(characterConfigSchema.safeParse(DEFAULT_CHARACTER).success).toBe(true);
  });

  it("rejects unknown layer ids", () => {
    const bad = { ...DEFAULT_CHARACTER, hairStyle: "mullet" };
    expect(characterConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects out-of-range palette indices", () => {
    expect(
      characterConfigSchema.safeParse({ ...DEFAULT_CHARACTER, skin: 99 }).success,
    ).toBe(false);
    expect(
      characterConfigSchema.safeParse({ ...DEFAULT_CHARACTER, topColor: -1 }).success,
    ).toBe(false);
    expect(
      characterConfigSchema.safeParse({ ...DEFAULT_CHARACTER, skin: 1.5 }).success,
    ).toBe(false);
  });

  it("rejects unknown and prototype-pollution keys", () => {
    expect(
      characterConfigSchema.safeParse({ ...DEFAULT_CHARACTER, extra: 1 }).success,
    ).toBe(false);
    // Zod builds a fresh object from known keys, so a "__proto__" payload
    // can never pollute the prototype of the parsed result.
    const polluted = JSON.parse(
      `{"skin":0,"hairStyle":"short","hairColor":0,"topStyle":"tee","topColor":0,"bottomStyle":"shorts","bottomColor":0,"shoes":"sandals","accessory":"none","prop":"none","__proto__":{"admin":true}}`,
    );
    const result = characterConfigSchema.safeParse(polluted);
    if (result.success) {
      expect(Object.getPrototypeOf(result.data)).toBe(Object.prototype);
      expect((result.data as Record<string, unknown>).admin).toBeUndefined();
      expect(({} as Record<string, unknown>).admin).toBeUndefined();
    }
  });

  it("migrates current version and rejects future versions", () => {
    expect(migrateCharacterConfig(DEFAULT_CHARACTER, CHARACTER_SCHEMA_VERSION)).toEqual(
      DEFAULT_CHARACTER,
    );
    expect(
      migrateCharacterConfig(DEFAULT_CHARACTER, CHARACTER_SCHEMA_VERSION + 1),
    ).toBeNull();
    expect(migrateCharacterConfig(DEFAULT_CHARACTER, 0)).toBeNull();
    expect(migrateCharacterConfig({ garbage: true }, 1)).toBeNull();
  });

  it("randomize always produces a valid config", () => {
    for (let i = 0; i < 200; i++) {
      const config = randomCharacter();
      expect(characterConfigSchema.safeParse(config).success).toBe(true);
    }
  });
});
