// Deterministic hashing of immutable user ids into movement parameters.
// Every client derives the same values, so no positions cross the network.

/** FNV-1a 32-bit over a UTF-8 string, with an optional lane for independence. */
export function fnv1a(input: string, lane = 0): number {
  let hash = 0x811c9dc5 ^ lane;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Uniform [0, 1) from an id and lane. Stable across sessions and clients. */
export function hash01(id: string, lane: number): number {
  return fnv1a(id, lane) / 0x100000000;
}

export interface MovementParams {
  routeIndex: number;
  /** Starting offset along the route timeline, in [0, 1). */
  phase01: number;
  /** Walking speed in world pixels per second. */
  speed: number;
  /** Multiplier applied to pause durations at pause nodes. */
  pauseScale: number;
  /** Small constant visual separation so identical routes do not overlap. */
  offsetX: number;
  offsetY: number;
}

export function deriveMovementParams(id: string, routeCount: number): MovementParams {
  return {
    routeIndex: fnv1a(id, 1) % Math.max(1, routeCount),
    phase01: hash01(id, 2),
    speed: 10 + hash01(id, 3) * 6, // 10..16 px/s: a slow beach amble
    pauseScale: 0.6 + hash01(id, 4) * 1.2, // 0.6x..1.8x
    offsetX: Math.floor(hash01(id, 5) * 7) - 3, // -3..3
    offsetY: Math.floor(hash01(id, 6) * 5) - 2, // -2..2
  };
}
