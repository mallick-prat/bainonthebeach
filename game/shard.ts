// Deterministic island sharding for crowds beyond one island.
// Assignment depends only on (user id, UTC day), never on reload.

import { fnv1a } from "./movement/hash";

export const SHARD_CAPACITY = 80;
export const SINGLE_ISLAND_MAX = 120;

export function shardCount(onBeachTotal: number): number {
  if (onBeachTotal <= SINGLE_ISLAND_MAX) return 1;
  return Math.ceil(onBeachTotal / SHARD_CAPACITY);
}

export function dayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function shardFor(userId: string, day: string, count: number): number {
  if (count <= 1) return 0;
  return fnv1a(`${userId}|${day}`, 17) % count;
}
