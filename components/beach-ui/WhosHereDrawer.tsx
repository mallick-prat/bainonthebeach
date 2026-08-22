"use client";

// Everyone on the beach: right-side drawer on desktop, bottom sheet on
// touch. Complete accessible alternative to canvas hover.

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicProfile } from "@/lib/data/types";
import { nameSortKey } from "@/lib/validation/names";
import { officeLabel } from "@/lib/config/offices";
import { AvatarThumb } from "./AvatarThumb";

export function WhosHereDrawer({
  open,
  sheet,
  people,
  selfId,
  onPick,
  onClose,
}: {
  open: boolean;
  sheet: boolean;
  people: PublicProfile[];
  selfId: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () =>
      [...people].sort((a, b) =>
        nameSortKey(a.displayName).localeCompare(nameSortKey(b.displayName)),
      ),
    [people],
  );
  const filtered = useMemo(() => {
    const q = nameSortKey(query.trim());
    if (!q) return sorted;
    return sorted.filter((p) => nameSortKey(p.displayName).includes(q));
  }, [sorted, query]);

  // Focus management + a simple focus trap while open.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("button, input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        "button, input, [tabindex]:not([tabindex='-1'])",
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const shell = sheet
    ? "anim-sheet fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] border-t-2 border-night pb-[env(safe-area-inset-bottom)]"
    : "anim-drawer fixed bottom-0 right-0 top-[var(--header-h)] z-50 w-[min(var(--drawer-w),92vw)] border-l-2 border-night";

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Who's here"
      className={`${shell} flex flex-col bg-pxwhite text-night shadow-[-4px_0_0_0_rgba(13,13,13,0.5)]`}
    >
      <div className="sticky top-0 flex items-center justify-between gap-2 border-b-2 border-night bg-pxwhite px-3 py-2">
        {sheet && (
          <span aria-hidden className="absolute left-1/2 top-1 h-1 w-10 -translate-x-1/2 bg-night/30" />
        )}
        <h2 className="font-pixel text-[9px]">
          WHO&apos;S HERE <span aria-hidden>·</span> {people.length}
        </h2>
        <button
          type="button"
          className="pixel-btn pixel-btn-ghost pixel-btn-sm"
          aria-label="Close"
          onClick={onClose}
        >
          X
        </button>
      </div>
      {people.length > 12 && (
        <div className="border-b-2 border-dotted border-night/20 p-2">
          <input
            className="pixel-input !min-h-0 !py-2 text-sm"
            placeholder="Search"
            aria-label="Search people"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      <ul className="flex-1 overflow-y-auto overscroll-contain">
        {filtered.length === 0 && (
          <li className="p-3 font-mono text-sm text-night/70">
            {people.length === 0 ? "THE BEACH IS QUIET" : "No matches."}
          </li>
        )}
        {filtered.map((p) => {
          const office = officeLabel(p.officeCode);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p.id)}
                className="flex min-h-16 w-full items-center gap-3 border-b-2 border-dotted border-night/15 px-3 py-2 text-left hover:bg-sand focus-visible:bg-sand"
              >
                <AvatarThumb config={p.characterConfig} />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-sm font-bold">
                    {p.displayName}
                    {p.id === selfId && (
                      <span className="font-pixel ml-2 bg-pxcyan px-1 text-[7px]">YOU</span>
                    )}
                  </span>
                  {office && (
                    <span className="block font-mono text-xs text-night/60">{office}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
