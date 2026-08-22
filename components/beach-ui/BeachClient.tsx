"use client";

// Orchestrates the island: compact top bar, full-bleed game stage, drawer,
// tooltip, status toggle, realtime reconciliation, failure states. All UI is
// DOM; the canvas only renders the world.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BeachSnapshot, PublicProfile } from "@/lib/data/types";
import type { BeachGame, BeachPerson } from "@/game/BeachGame";
import { rowToProfile, type ProfileRow } from "@/lib/data/convert";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { setBeachStatusAction, signOutAction, type ActionResult } from "@/app/actions";
import { shardCount, shardFor, dayKey } from "@/game/shard";
import { clampLabel } from "@/lib/ui/clamp";
import { nameSortKey } from "@/lib/validation/names";
import { track } from "@/lib/observability/analytics";
import { PersonLabel } from "./PersonLabel";
import { WhosHereDrawer } from "./WhosHereDrawer";
import { SoundToggle } from "./SoundToggle";

const DEV_OVERLAY =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_DEV_OVERLAY === "1";

const ZOOM_KEY = "botb-zoom";

type Net = "live" | "polling" | "offline";

export function BeachClient({
  initial,
  selfId,
}: {
  initial: BeachSnapshot;
  selfId: string;
}) {
  const [profiles, setProfiles] = useState<Record<string, PublicProfile>>(() => {
    const map: Record<string, PublicProfile> = {};
    for (const p of initial.people) map[p.id] = p;
    if (initial.self) map[initial.self.id] = initial.self;
    return map;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [net, setNet] = useState<Net>(initial.demo ? "polling" : "live");
  const [gameFailed, setGameFailed] = useState(false);
  const [gameReady, setGameReady] = useState(false);
  const [labelPos, setLabelPos] = useState({ x: 0, y: 0 });
  const [announcement, setAnnouncement] = useState("");
  const [statusPending, setStatusPending] = useState(false);
  const [shard, setShard] = useState<number | null>(null);
  const [isSheet, setIsSheet] = useState(false);

  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<BeachGame | null>(null);
  const whosHereRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const profilesRef = useRef(profiles);
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  const self = profiles[selfId] ?? null;
  const onBeach = useMemo(
    () =>
      Object.values(profiles).filter((p) => p.onBeach && p.characterConfig !== null),
    [profiles],
  );
  const totalShards = shardCount(onBeach.length);
  const activeShard =
    totalShards <= 1 ? 0 : (shard ?? shardFor(selfId, dayKey(), totalShards));
  const islandPeople = useMemo(
    () =>
      totalShards <= 1
        ? onBeach
        : onBeach.filter((p) => shardFor(p.id, dayKey(), totalShards) === activeShard),
    [onBeach, totalShards, activeShard],
  );

  /* ---------------- snapshot + realtime ---------------- */

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch("/api/beach", { cache: "no-store" });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) return;
      const snap = (await res.json()) as BeachSnapshot;
      setProfiles(() => {
        const map: Record<string, PublicProfile> = {};
        for (const p of snap.people) map[p.id] = p;
        if (snap.self) map[snap.self.id] = snap.self;
        return map;
      });
    } catch {
      // Offline or transient failure; the poll/reconnect will retry.
    }
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setNet(initial.demo ? "polling" : "live");
      void fetchSnapshot();
    };
    const onOffline = () => setNet("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const initialCheck = window.setTimeout(() => {
      if (!navigator.onLine) setNet("offline");
    }, 0);
    return () => {
      window.clearTimeout(initialCheck);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [fetchSnapshot, initial.demo]);

  useEffect(() => {
    if (initial.demo) {
      const timer = window.setInterval(() => {
        if (document.visibilityState === "visible" && navigator.onLine) {
          void fetchSnapshot();
        }
      }, 15_000);
      return () => window.clearInterval(timer);
    }

    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    let hadError = false;
    let pollTimer: number | undefined;
    const startPolling = () => {
      setNet("polling");
      if (!pollTimer) {
        pollTimer = window.setInterval(() => {
          if (document.visibilityState === "visible" && navigator.onLine) {
            void fetchSnapshot();
          }
        }, 30_000);
      }
    };
    const stopPolling = () => {
      if (pollTimer) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };

    const channel = supabase
      .channel("beach-profiles")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as Partial<ProfileRow>;
            if (old.id) {
              setProfiles((prev) => {
                const next = { ...prev };
                delete next[old.id!];
                return next;
              });
            }
            return;
          }
          const row = payload.new as ProfileRow;
          if (!row?.id) return;
          setProfiles((prev) => ({ ...prev, [row.id]: rowToProfile(row) }));
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setNet("live");
          stopPolling();
          if (hadError) {
            hadError = false;
            // Re-fetch authoritative data instead of trusting missed events.
            void fetchSnapshot();
          }
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          hadError = true;
          startPolling();
        }
      });

    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") window.location.assign("/");
    });

    return () => {
      stopPolling();
      void supabase.removeChannel(channel);
      authSub.subscription.unsubscribe();
    };
  }, [initial.demo, fetchSnapshot]);

  /* ---------------- game lifecycle ---------------- */

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let game: BeachGame | null = null;
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    (async () => {
      try {
        const mod = await import("@/game/BeachGame");
        if (disposed) return;
        game = await mod.BeachGame.create(host, {
          reducedMotion: reducedQuery.matches,
          devOverlay: DEV_OVERLAY,
          onSelect: (id) => {
            setSelectedId(id);
            setHoveredId(null);
          },
          onHover: (id) => setHoveredId(id),
          onZoomChange: (delta) => {
            window.localStorage.setItem(ZOOM_KEY, String(delta));
          },
        });
        if (disposed) {
          game.destroy();
          return;
        }
        const storedZoom = Number(window.localStorage.getItem(ZOOM_KEY) ?? "0");
        game.setZoomDelta(Number.isFinite(storedZoom) ? storedZoom : 0);
        gameRef.current = game;
        setGameReady(true);
      } catch {
        track("game_load_failed");
        if (disposed) return;
        setGameFailed(true);
        try {
          const mod = await import("@/game/BeachGame");
          const people = Object.values(profilesRef.current)
            .filter((p) => p.onBeach && p.characterConfig)
            .map((p) => toBeachPerson(p, selfId));
          mod.renderStaticFallback(host, people);
        } catch {
          // Even the 2D fallback failed; the drawer still lists everyone.
        }
      }
    })();

    const onMotion = () => gameRef.current?.setReducedMotion(reducedQuery.matches);
    reducedQuery.addEventListener("change", onMotion);

    return () => {
      disposed = true;
      reducedQuery.removeEventListener("change", onMotion);
      gameRef.current = null;
      game?.destroy();
      setGameReady(false);
    };
  }, [selfId]);

  useEffect(() => {
    if (!gameReady) return;
    gameRef.current?.setPeople(islandPeople.map((p) => toBeachPerson(p, selfId)));
  }, [islandPeople, selfId, gameReady]);

  // Sheet-vs-tooltip presentation.
  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px), (pointer: coarse)");
    const update = () => setIsSheet(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Anchor the tooltip above the character; flip UNDER the feet at the top
  // edge so it never covers its target. Measured size, 80ms cadence.
  const activeLabelId = selectedId ?? hoveredId;
  useEffect(() => {
    if (!activeLabelId || isSheet || !gameReady) return;
    const host = hostRef.current;
    const update = () => {
      const pos = gameRef.current?.getScreenPosition(activeLabelId);
      if (!pos || !host) return;
      const el = host.parentElement?.querySelector<HTMLElement>("[data-person-label]");
      const lw = el?.offsetWidth ?? 110;
      const lh = el?.offsetHeight ?? 30;
      const place = clampLabel(pos.x, pos.y, lw, lh, host.clientWidth, host.clientHeight);
      if (place.below) place.y = Math.min(pos.footY + 6, host.clientHeight - lh - 4);
      setLabelPos({ x: place.x, y: place.y });
    };
    update();
    const timer = window.setInterval(update, 80);
    return () => window.clearInterval(timer);
  }, [activeLabelId, isSheet, gameReady]);

  const selectPerson = useCallback((id: string | null) => {
    setSelectedId(id);
    gameRef.current?.setSelected(id);
  }, []);

  const changeZoom = useCallback((dir: 1 | -1) => {
    const game = gameRef.current;
    if (!game) return;
    game.setZoomDelta(game.getZoomDelta() + dir);
    window.localStorage.setItem(ZOOM_KEY, String(game.getZoomDelta()));
  }, []);

  // Esc: close menu > close drawer > clear selection > open menu. +/- zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (menuOpen) {
          setMenuOpen(false);
          menuButtonRef.current?.focus();
        } else if (drawerOpen) {
          setDrawerOpen(false);
          whosHereRef.current?.focus();
        } else if (selectedId || hoveredId) {
          selectPerson(null);
          setHoveredId(null);
        } else {
          setMenuOpen(true);
        }
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === "+" || e.key === "=") {
        if (e.metaKey || e.ctrlKey) e.preventDefault();
        changeZoom(1);
      }
      if (e.key === "-" || e.key === "_") {
        if (e.metaKey || e.ctrlKey) e.preventDefault();
        changeZoom(-1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, drawerOpen, selectedId, hoveredId, selectPerson, changeZoom]);

  useEffect(() => {
    if (menuOpen) {
      menuRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    }
  }, [menuOpen]);

  /* ---------------- actions ---------------- */

  const pickFromDrawer = (id: string) => {
    setDrawerOpen(false);
    whosHereRef.current?.focus();
    if (totalShards > 1) {
      const s = shardFor(id, dayKey(), totalShards);
      if (s !== activeShard) setShard(s);
    }
    selectPerson(id);
    gameRef.current?.focusPerson(id);
  };

  const toggleBeach = (join: boolean) => {
    if (statusPending || !self) return;
    setStatusPending(true);
    const prev = self;
    setProfiles((p) => ({
      ...p,
      [selfId]: {
        ...prev,
        onBeach: join,
        onBeachSince: join ? new Date().toISOString() : null,
      },
    }));
    const timeout = new Promise<ActionResult>((resolve) =>
      window.setTimeout(() => resolve({ ok: false, error: "Timed out. Try again." }), 8000),
    );
    void Promise.race([
      setBeachStatusAction(join).then((r) => r ?? { ok: true as const }),
      timeout,
    ])
      .then((res) => {
        if (!res.ok) {
          setProfiles((p) => ({ ...p, [selfId]: prev }));
          setAnnouncement(res.error);
        } else {
          setAnnouncement(join ? "You are on the beach." : "You left the beach.");
        }
      })
      .finally(() => setStatusPending(false));
  };

  // Keyboard navigation across characters from the canvas wrapper.
  const onCanvasKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const sorted = [...islandPeople].sort((a, b) =>
      nameSortKey(a.displayName).localeCompare(nameSortKey(b.displayName)),
    );
    if (sorted.length === 0) return;
    const idx = sorted.findIndex((p) => p.id === selectedId);
    const nextIdx =
      e.key === "ArrowRight"
        ? (idx + 1) % sorted.length
        : (idx - 1 + sorted.length) % sorted.length;
    const next = sorted[nextIdx]!;
    selectPerson(next.id);
    setAnnouncement(next.displayName);
  };

  const activePerson = activeLabelId ? (profiles[activeLabelId] ?? null) : null;
  const isOn = self?.onBeach ?? false;

  /* ---------------- render ---------------- */

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-night">
      {/* Compact top bar */}
      <header className="z-30 flex h-[var(--header-h)] shrink-0 items-center gap-2 border-b-2 border-pxwhite/20 px-2 pt-[env(safe-area-inset-top)] sm:gap-3 sm:px-3">
        <span className="font-pixel bg-[#b41313] px-2 py-1 text-[10px] text-pxwhite">
          BAIN
        </span>
        <span className="font-pixel hidden truncate text-[9px] text-pxyellow sm:inline">
          ON THE BEACH
        </span>
        {initial.demo && (
          <span className="font-pixel bg-pxorange px-1.5 py-0.5 text-[7px] text-night">
            DEMO
          </span>
        )}
        <span className="flex-1" />
        <button
          ref={whosHereRef}
          type="button"
          className="pixel-btn pixel-btn-dark pixel-btn-sm"
          onClick={() => setDrawerOpen(true)}
        >
          Who&apos;s here <span aria-hidden>·</span> {onBeach.length}
        </button>
        <span
          className="font-pixel hidden items-center gap-1.5 px-1 text-[8px] text-pxwhite/90 md:flex"
          role="status"
        >
          <span
            aria-hidden
            className="status-dot"
            style={{ background: isOn ? "var(--px-green)" : "#555555" }}
          />
          {isOn ? "ON THE BEACH" : "OFF THE BEACH"}
        </span>
        <button
          type="button"
          className={`pixel-btn pixel-btn-sm ${isOn ? "pixel-btn-dark" : "pixel-btn-primary"} min-w-[72px]`}
          disabled={statusPending}
          onClick={() => toggleBeach(!isOn)}
        >
          {statusPending ? "..." : isOn ? "Leave" : "Join"}
        </button>
        <button
          ref={menuButtonRef}
          type="button"
          className="pixel-btn pixel-btn-dark pixel-btn-sm"
          aria-expanded={menuOpen}
          aria-label="Menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          =
        </button>
      </header>

      {/* Settings menu (tertiary actions). Esc toggles it. */}
      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Settings"
          className="anim-drawer pixel-panel-dark absolute right-2 top-[calc(var(--header-h)+6px)] z-[60] flex w-56 flex-col gap-2 p-2"
        >
          <Link
            href="/create-character"
            role="menuitem"
            className="pixel-btn pixel-btn-dark pixel-btn-sm justify-start"
          >
            Edit character
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="menuitem"
              className="pixel-btn pixel-btn-dark pixel-btn-sm"
              aria-label="Zoom out"
              onClick={() => changeZoom(-1)}
            >
              -
            </button>
            <span className="font-pixel flex-1 text-center text-[8px] text-pxwhite/80">
              ZOOM
            </span>
            <button
              type="button"
              role="menuitem"
              className="pixel-btn pixel-btn-dark pixel-btn-sm"
              aria-label="Zoom in"
              onClick={() => changeZoom(1)}
            >
              +
            </button>
          </div>
          <SoundToggle />
          <form action={signOutAction}>
            <button role="menuitem" className="pixel-btn pixel-btn-dark pixel-btn-sm w-full justify-start">
              Sign out
            </button>
          </form>
        </div>
      )}

      {/* Game stage */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={hostRef}
          tabIndex={0}
          role="application"
          aria-label="The island. Arrow keys move between people. Drag to pan when zoomed."
          onKeyDown={onCanvasKeyDown}
          className="absolute inset-0 overflow-hidden outline-offset-[-2px]"
        >
          {!gameReady && !gameFailed && (
            <div className="pixel-skeleton absolute inset-6" aria-hidden />
          )}
        </div>

        {totalShards > 1 && (
          <nav
            aria-label="Islands"
            className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-2"
          >
            {Array.from({ length: totalShards }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={i === activeShard}
                className={`pixel-btn pixel-btn-sm ${
                  i === activeShard ? "pixel-btn-secondary" : "pixel-btn-dark"
                }`}
                onClick={() => setShard(i)}
              >
                Island {i + 1}
              </button>
            ))}
          </nav>
        )}

        {islandPeople.length === 0 && (gameReady || gameFailed) && (
          <div className="pixel-panel pointer-events-none absolute left-1/2 top-8 z-20 -translate-x-1/2 px-3 py-2">
            <p className="font-pixel text-[9px]">THE BEACH IS QUIET</p>
          </div>
        )}

        {activePerson && !isSheet && (
          <PersonLabel
            person={activePerson}
            isSelf={activePerson.id === selfId}
            x={labelPos.x}
            y={labelPos.y}
            asSheet={false}
            onClose={() => selectPerson(null)}
          />
        )}
      </div>

      {/* Status strips */}
      {net === "offline" && (
        <p className="absolute inset-x-0 bottom-0 z-40 bg-pxred px-2 py-1 text-center font-mono text-xs text-pxwhite">
          Offline. Waiting for the tide.
        </p>
      )}
      {net === "polling" && !initial.demo && (
        <p className="absolute inset-x-0 bottom-0 z-40 bg-pxorange px-2 py-1 text-center font-mono text-xs text-night">
          Live updates down. Refreshing now and then.
        </p>
      )}

      {activePerson && isSheet && (
        <PersonLabel
          person={activePerson}
          isSelf={activePerson.id === selfId}
          x={0}
          y={0}
          asSheet
          onClose={() => selectPerson(null)}
        />
      )}

      <WhosHereDrawer
        open={drawerOpen}
        sheet={isSheet}
        people={onBeach}
        selfId={selfId}
        onPick={pickFromDrawer}
        onClose={() => {
          setDrawerOpen(false);
          whosHereRef.current?.focus();
        }}
      />

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function toBeachPerson(p: PublicProfile, selfId: string): BeachPerson {
  return {
    id: p.id,
    displayName: p.displayName,
    officeCode: p.officeCode,
    config: p.characterConfig!,
    isSelf: p.id === selfId,
  };
}
