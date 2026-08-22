// The island renderer. PixiJS v8 scene graph, one sprite per beachgoer,
// deterministic positions computed from unix time each tick. No React here.
//
// Camera: default scale fits the whole island to the stage. Zoom steps go
// above that; when the world overflows the stage the user can click-drag
// (or touch-drag) to pan, clamped to the world bounds.

import { Application, Container, Sprite, Texture, Graphics } from "pixi.js";
import type { CharacterConfig } from "@/lib/validation/character";
import {
  FOOT_BASELINE,
  SPRITE_H,
  spriteKey,
  type Direction,
  type Pose,
} from "./sprites/characterSprites";
import { spriteCanvas } from "./sprites/toCanvas";
import {
  characterStateAt,
  staticStateFor,
  walkPose,
} from "./movement/deterministic";
import { WORLD_H, WORLD_W, ROUTES, blockers } from "./world/geometry";
import { paintGround, worldProps } from "./world/paint";

export interface BeachPerson {
  id: string;
  displayName: string;
  config: CharacterConfig;
  isSelf: boolean;
}

export interface BeachGameOptions {
  reducedMotion: boolean;
  devOverlay?: boolean;
  /** Selection changed via canvas interaction (tap/click). null = cleared. */
  onSelect: (id: string | null) => void;
  /** Desktop hover highlight. */
  onHover: (id: string | null) => void;
  /** Zoom level changed (buttons, keys, or ctrl/pinch scroll). */
  onZoomChange?: (delta: number) => void;
}

interface CharEntry {
  person: BeachPerson;
  sprite: Sprite;
  marker: Graphics | null;
  lastTexKey: string;
}

const ENV_FRAME_MS = 800;
const DRAG_THRESHOLD_PX = 5;

export class BeachGame {
  private app: Application;
  private host: HTMLElement;
  private opts: BeachGameOptions;
  private world = new Container();
  private ground!: Sprite;
  private groundFrames!: [Texture, Texture];
  private propSprites: Array<{ sprite: Sprite; frames: [Texture, Texture] }> =
    [];
  private chars = new Map<string, CharEntry>();
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private scale = 2;
  private zoomDelta = 0;
  private focusX = WORLD_W / 2;
  private focusY = WORLD_H / 2;
  private wasDrag = false;
  /** Camera follows this person while set (click-to-follow). */
  private followId: string | null = null;
  /** True when the follow zoom was applied automatically on selection. */
  private autoZoomed = false;
  private textures = new Map<string, Texture>();
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: number | undefined;
  private detachDom: (() => void) | null = null;
  private onVisibility = () => {
    if (document.visibilityState === "visible") {
      this.app.ticker.start();
    } else {
      this.app.ticker.stop();
    }
  };
  private destroyed = false;

  private constructor(
    app: Application,
    host: HTMLElement,
    opts: BeachGameOptions,
  ) {
    this.app = app;
    this.host = host;
    this.opts = opts;
  }

  static async create(
    host: HTMLElement,
    opts: BeachGameOptions,
  ): Promise<BeachGame> {
    const app = new Application();
    await app.init({
      width: WORLD_W,
      height: WORLD_H,
      background: "#f0d890",
      antialias: false,
      resolution: 1,
      autoDensity: false,
    });
    const game = new BeachGame(app, host, opts);
    game.setup();
    return game;
  }

  private texture(canvas: HTMLCanvasElement): Texture {
    const tex = Texture.from(canvas);
    tex.source.scaleMode = "nearest";
    return tex;
  }

  private setup() {
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.imageRendering = "pixelated";
    canvas.style.display = "block";
    canvas.style.position = "absolute";
    canvas.style.touchAction = "none";
    // Subtle stage frame separating the world from the page.
    canvas.style.outline = "2px solid rgba(252, 252, 252, 0.22)";
    canvas.style.boxShadow = "0 6px 0 0 rgba(0, 0, 0, 0.45)";
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "Pixel island with beachgoers wandering around. Use the who's here list for details.",
    );
    this.host.appendChild(canvas);

    this.groundFrames = [
      this.texture(paintGround(0)),
      this.texture(paintGround(1)),
    ];
    this.ground = new Sprite(this.groundFrames[0]);
    this.ground.eventMode = "static";
    this.ground.on("pointertap", () => {
      if (this.wasDrag) return;
      this.setSelected(null);
      this.opts.onSelect(null);
    });
    this.app.stage.addChild(this.ground);

    this.world.sortableChildren = true;
    this.app.stage.addChild(this.world);

    for (const prop of worldProps()) {
      const frames: [Texture, Texture] = [
        this.texture(prop.frames[0]),
        this.texture(prop.frames[1]),
      ];
      const sprite = new Sprite(frames[0]);
      sprite.position.set(prop.x, prop.y);
      sprite.zIndex = prop.footY;
      this.world.addChild(sprite);
      this.propSprites.push({ sprite, frames });
    }

    if (this.opts.devOverlay) this.drawDevOverlay();

    let lastEnvFrame = -1;
    this.app.ticker.add(() => {
      const now = Date.now();
      const envFrame = this.opts.reducedMotion
        ? 0
        : Math.floor(now / ENV_FRAME_MS) % 2;
      if (envFrame !== lastEnvFrame) {
        lastEnvFrame = envFrame;
        const idx = envFrame as 0 | 1;
        this.ground.texture = this.groundFrames[idx];
        for (const p of this.propSprites) p.sprite.texture = p.frames[idx];
      }
      this.tickCharacters(now);
    });

    document.addEventListener("visibilitychange", this.onVisibility);

    // Debounced relayout on stage resize.
    this.resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.layout(), 80);
    });
    this.resizeObserver.observe(this.host);

    this.attachPan(canvas);
    this.layout();
  }

  /* ---------------- camera ---------------- */

  setZoomDelta(delta: number) {
    const next = Math.max(0, Math.min(3, Math.round(delta)));
    const changed = next !== this.zoomDelta;
    this.zoomDelta = next;
    this.layout();
    if (changed) this.opts.onZoomChange?.(next);
  }

  /** Zoom one step, keeping the host point (hx, hy) fixed under the cursor. */
  zoomAt(hx: number, hy: number, dir: 1 | -1) {
    const canvas = this.app.canvas as HTMLCanvasElement;
    const before = this.scale;
    const rect = canvas.getBoundingClientRect();
    const hostRect = this.host.getBoundingClientRect();
    const worldX = (hostRect.left + hx - rect.left) / before;
    const worldY = (hostRect.top + hy - rect.top) / before;
    this.setZoomDelta(this.zoomDelta + dir);
    if (this.scale !== before) {
      const w = this.host.clientWidth;
      const h = this.host.clientHeight;
      this.focusX = worldX + (w / 2 - hx) / this.scale;
      this.focusY = worldY + (h / 2 - hy) / this.scale;
      this.layout();
    }
  }

  getZoomDelta(): number {
    return this.zoomDelta;
  }

  /** Aim the camera at a world point (used when picking from the drawer). */
  focusWorld(x: number, y: number) {
    this.focusX = x;
    this.focusY = y;
    this.layout();
  }

  focusPerson(id: string) {
    const entry = this.chars.get(id);
    if (entry) this.focusWorld(entry.sprite.x, entry.sprite.y);
  }

  /** Click-to-follow: zoom in on the person and keep them centered. */
  private setFollow(id: string | null) {
    if (id) {
      this.followId = id;
      if (this.zoomDelta === 0) {
        this.autoZoomed = true;
        this.setZoomDelta(2);
      }
      this.focusPerson(id);
    } else {
      // Clicking off always resets to the full world view.
      this.followId = null;
      this.autoZoomed = false;
      this.focusX = WORLD_W / 2;
      this.focusY = WORLD_H / 2;
      this.setZoomDelta(0);
      this.layout();
    }
  }

  private attachPan(canvas: HTMLCanvasElement) {
    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;

    const down = (e: PointerEvent) => {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      this.wasDrag = false;
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > DRAG_THRESHOLD_PX) {
        this.wasDrag = true;
        this.followId = null; // dragging takes the camera back
        this.focusX -= dx / this.scale;
        this.focusY -= dy / this.scale;
        this.layout();
      }
    };
    const up = () => {
      dragging = false;
      // Leave wasDrag set for the click/tap that follows a drag; clear soon.
      window.setTimeout(() => {
        this.wasDrag = false;
      }, 0);
    };
    // Wheel: two-finger scroll pans; ctrl/cmd scroll (incl. trackpad pinch)
    // zooms toward the cursor.
    let wheelAcc = 0;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const hostRect = this.host.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        wheelAcc += e.deltaY;
        if (Math.abs(wheelAcc) >= 30) {
          const dir: 1 | -1 = wheelAcc < 0 ? 1 : -1;
          wheelAcc = 0;
          this.zoomAt(e.clientX - hostRect.left, e.clientY - hostRect.top, dir);
        }
      } else {
        this.focusX += e.deltaX / this.scale;
        this.focusY += e.deltaY / this.scale;
        this.layout();
      }
    };
    this.host.addEventListener("wheel", wheel, { passive: false });

    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    this.detachDom = () => {
      this.host.removeEventListener("wheel", wheel);
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }

  private layout() {
    const canvas = this.app.canvas as HTMLCanvasElement;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w === 0 || h === 0) return;

    // Cover the stage: the world's edges are open ocean, so filling the
    // viewport only ever crops water. On extreme aspect ratios the cover
    // scale is capped relative to fit so land is never cropped hard.
    const fit = Math.min(w / WORLD_W, h / WORLD_H);
    const cover = Math.max(w / WORLD_W, h / WORLD_H);
    const base = Math.min(cover, fit * 1.75);
    this.scale = base * Math.pow(1.4, this.zoomDelta);

    const cssW = WORLD_W * this.scale;
    const cssH = WORLD_H * this.scale;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.style.cursor = cssW > w || cssH > h ? "grab" : "";

    // Clamp the focus point so the view never leaves the world.
    const halfW = w / 2 / this.scale;
    const halfH = h / 2 / this.scale;
    this.focusX =
      cssW <= w
        ? WORLD_W / 2
        : Math.max(halfW, Math.min(WORLD_W - halfW, this.focusX));
    this.focusY =
      cssH <= h
        ? WORLD_H / 2
        : Math.max(halfH, Math.min(WORLD_H - halfH, this.focusY));

    const left =
      cssW <= w
        ? Math.round((w - cssW) / 2)
        : Math.round(w / 2 - this.focusX * this.scale);
    const top =
      cssH <= h
        ? Math.round((h - cssH) / 2)
        : Math.round(h / 2 - this.focusY * this.scale);
    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;
  }

  /** CSS pixel position of a person inside the host: head top + foot line. */
  getScreenPosition(
    id: string,
  ): { x: number; y: number; footY: number } | null {
    const entry = this.chars.get(id);
    if (!entry) return null;
    const canvas = this.app.canvas as HTMLCanvasElement;
    const hostBox = this.host.getBoundingClientRect();
    const box = canvas.getBoundingClientRect();
    const x = box.left - hostBox.left + entry.sprite.x * this.scale;
    const headY =
      box.top - hostBox.top + (entry.sprite.y - SPRITE_H + 2) * this.scale;
    const footY = box.top - hostBox.top + entry.sprite.y * this.scale;
    return { x, y: headY, footY };
  }

  /* ---------------- people ---------------- */

  setPeople(people: BeachPerson[]) {
    const seen = new Set<string>();
    for (const person of people) {
      seen.add(person.id);
      const existing = this.chars.get(person.id);
      if (existing) {
        existing.person = person;
        existing.lastTexKey = ""; // config may have changed; re-resolve texture
        continue;
      }
      const sprite = new Sprite();
      sprite.anchor.set(0.5, (FOOT_BASELINE + 1) / SPRITE_H);
      sprite.eventMode = "static";
      sprite.cursor = "pointer";
      sprite.on("pointertap", (e) => {
        if (this.wasDrag) return;
        e.stopPropagation();
        this.setSelected(person.id);
        this.opts.onSelect(person.id);
      });
      sprite.on("pointerover", () => {
        this.hoveredId = person.id;
        this.opts.onHover(person.id);
      });
      sprite.on("pointerout", () => {
        if (this.hoveredId === person.id) {
          this.hoveredId = null;
          this.opts.onHover(null);
        }
      });
      this.world.addChild(sprite);
      let marker: Graphics | null = null;
      if (person.isSelf) {
        // Subtle, non-pulsing marker over your own character.
        marker = new Graphics();
        marker.rect(0, 0, 2, 2).fill("#00e8d8");
        marker.rect(-1, -2, 4, 2).fill("#00e8d8");
        this.world.addChild(marker);
      }
      this.chars.set(person.id, { person, sprite, marker, lastTexKey: "" });
    }
    for (const [id, entry] of this.chars) {
      if (!seen.has(id)) {
        entry.sprite.destroy();
        entry.marker?.destroy();
        this.chars.delete(id);
      }
    }
    this.tickCharacters(Date.now());
  }

  setSelected(id: string | null) {
    this.selectedId = id;
    this.setFollow(id);
    for (const entry of this.chars.values()) entry.lastTexKey = "";
    this.tickCharacters(Date.now());
  }

  setReducedMotion(reduced: boolean) {
    this.opts.reducedMotion = reduced;
  }

  private tickCharacters(now: number) {
    for (const entry of this.chars.values()) {
      const { person, sprite } = entry;
      const state = this.opts.reducedMotion
        ? staticStateFor(person.id)
        : characterStateAt(person.id, now);
      sprite.position.set(Math.round(state.x), Math.round(state.y));
      sprite.zIndex = state.y;
      if (entry.marker) {
        entry.marker.position.set(
          Math.round(state.x) - 2,
          Math.round(state.y) - SPRITE_H - 2,
        );
        entry.marker.zIndex = state.y;
      }
      if (this.followId === person.id) {
        this.focusX = state.x;
        this.focusY = state.y;
        this.layout();
      }
      const pose: Pose = this.opts.reducedMotion ? "idle" : walkPose(state);
      const dir: Direction = state.dir;
      const highlighted =
        this.selectedId === person.id || this.hoveredId === person.id;
      const outline = highlighted ? "white" : "black";
      const key = spriteKey(person.config, dir, pose, outline);
      if (key !== entry.lastTexKey) {
        entry.lastTexKey = key;
        let tex = this.textures.get(key);
        if (!tex) {
          tex = this.texture(spriteCanvas(person.config, dir, pose, outline));
          this.textures.set(key, tex);
        }
        sprite.texture = tex;
      }
    }
  }

  private drawDevOverlay() {
    const g = new Graphics();
    for (const route of ROUTES) {
      const pts = route.points;
      g.moveTo(pts[0]![0], pts[0]![1]);
      for (let i = 1; i <= pts.length; i++) {
        const p = pts[i % pts.length]!;
        g.lineTo(p[0], p[1]);
      }
      g.stroke({ width: 1, color: 0xe40058, alpha: 0.7 });
    }
    for (const b of blockers()) {
      g.circle(b.x, b.y, b.r).stroke({ width: 1, color: 0x0058f8, alpha: 0.7 });
    }
    g.zIndex = 10000;
    this.world.addChild(g);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
    this.detachDom?.();
    this.app.destroy(true, { children: true, texture: true });
  }
}

/**
 * Static DOM fallback when WebGL/Pixi is unavailable: draws one 2D frame of
 * the same scene. People remain fully accessible through the drawer.
 */
export function renderStaticFallback(host: HTMLElement, people: BeachPerson[]) {
  const canvas = document.createElement("canvas");
  canvas.width = WORLD_W;
  canvas.height = WORLD_H;
  canvas.style.imageRendering = "pixelated";
  canvas.style.width = "100%";
  canvas.style.maxWidth = `${WORLD_W * 3}px`;
  canvas.style.margin = "0 auto";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Static picture of the island.");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(paintGround(0), 0, 0);
  const items: Array<{ footY: number; draw: () => void }> = [];
  for (const prop of worldProps()) {
    items.push({
      footY: prop.footY,
      draw: () => ctx.drawImage(prop.frames[0], prop.x, prop.y),
    });
  }
  for (const person of people) {
    const state = staticStateFor(person.id);
    const sprite = spriteCanvas(person.config, state.dir, "idle", "black");
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
  host.innerHTML = "";
  host.appendChild(canvas);
}
