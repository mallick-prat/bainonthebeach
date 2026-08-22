// Deterministic ambient movement.
// A character's position is a pure function of (immutable user id, unix time).
// Every viewer computes the same result, so no coordinates are broadcast.

import { ROUTES } from "@/game/world/geometry";
import { deriveMovementParams, fnv1a, type MovementParams } from "./hash";
import type { Direction } from "@/game/sprites/characterSprites";

interface WalkSeg {
  kind: "walk";
  from: [number, number];
  to: [number, number];
  len: number;
  dur: number;
  /** Cumulative walked distance at the start of this segment. */
  distStart: number;
}

interface PauseSeg {
  kind: "pause";
  at: [number, number];
  dur: number;
  facing: Direction;
  distStart: number;
}

type Seg = WalkSeg | PauseSeg;

interface Timeline {
  segs: Seg[];
  period: number;
  totalDist: number;
}

const BASE_PAUSE_SECONDS = 3;

export function facingFromVelocity(dx: number, dy: number): Direction {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "east" : "west";
  return dy >= 0 ? "south" : "north";
}

/** Deterministic: does this route pause at node i? Same for every viewer. */
function pausesAtNode(routeIndex: number, nodeIndex: number): boolean {
  return fnv1a(`${routeIndex}:${nodeIndex}`, 11) % 3 === 0;
}

const timelineCache = new Map<string, Timeline>();

export function buildTimeline(routeIndex: number, params: MovementParams): Timeline {
  const key = `${routeIndex}|${params.speed.toFixed(3)}|${params.pauseScale.toFixed(3)}`;
  const cached = timelineCache.get(key);
  if (cached) return cached;

  const route = ROUTES[routeIndex % ROUTES.length]!;
  const pts = route.points;
  const segs: Seg[] = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const from = pts[i]!;
    const to = pts[(i + 1) % pts.length]!;
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    segs.push({
      kind: "walk",
      from: [from[0], from[1]],
      to: [to[0], to[1]],
      len,
      dur: len / params.speed,
      distStart: dist,
    });
    dist += len;
    const nextIndex = (i + 1) % pts.length;
    if (pausesAtNode(routeIndex % ROUTES.length, nextIndex)) {
      const after = pts[(nextIndex + 1) % pts.length]!;
      segs.push({
        kind: "pause",
        at: [to[0], to[1]],
        dur: BASE_PAUSE_SECONDS * params.pauseScale,
        facing: facingFromVelocity(after[0] - to[0], after[1] - to[1]),
        distStart: dist,
      });
    }
  }
  const period = segs.reduce((sum, s) => sum + s.dur, 0);
  const timeline: Timeline = { segs, period, totalDist: dist };
  timelineCache.set(key, timeline);
  return timeline;
}

export interface CharacterState {
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  /** Cumulative walked distance, for walk-frame selection. */
  dist: number;
}

/**
 * Position at unix time tMs. Pure and total: any finite t maps to a valid
 * state, so clock jumps, sleep/resume, and dropped frames self-recover.
 */
export function characterStateAt(id: string, tMs: number): CharacterState {
  const params = deriveMovementParams(id, ROUTES.length);
  const timeline = buildTimeline(params.routeIndex, params);
  const { segs, period } = timeline;

  let t = Number.isFinite(tMs) ? tMs / 1000 : 0;
  t = ((t % period) + period + params.phase01 * period) % period;

  for (const seg of segs) {
    if (t < seg.dur) {
      if (seg.kind === "pause") {
        return {
          x: seg.at[0] + params.offsetX,
          y: seg.at[1] + params.offsetY,
          dir: seg.facing,
          moving: false,
          dist: seg.distStart,
        };
      }
      const frac = seg.dur === 0 ? 0 : t / seg.dur;
      const x = seg.from[0] + (seg.to[0] - seg.from[0]) * frac;
      const y = seg.from[1] + (seg.to[1] - seg.from[1]) * frac;
      return {
        x: x + params.offsetX,
        y: y + params.offsetY,
        dir: facingFromVelocity(seg.to[0] - seg.from[0], seg.to[1] - seg.from[1]),
        moving: true,
        dist: seg.distStart + seg.len * frac,
      };
    }
    t -= seg.dur;
  }
  // Floating point tail: snap to the first segment start.
  const first = segs[0]!;
  const at = first.kind === "walk" ? first.from : first.at;
  return {
    x: at[0] + params.offsetX,
    y: at[1] + params.offsetY,
    dir: "south",
    moving: false,
    dist: 0,
  };
}

/** Stable position for prefers-reduced-motion: freeze each user at a spot. */
export function staticStateFor(id: string): CharacterState {
  const params = deriveMovementParams(id, ROUTES.length);
  const timeline = buildTimeline(params.routeIndex, params);
  const state = characterStateAt(id, params.phase01 * timeline.period * 1000);
  return { ...state, moving: false };
}

/** Walk animation frame from cumulative distance: one step every 7px. */
export function walkPose(state: CharacterState): "idle" | "walkA" | "walkB" {
  if (!state.moving) return "idle";
  return Math.floor(state.dist / 7) % 2 === 0 ? "walkA" : "walkB";
}
