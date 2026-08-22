"use client";

// Compact identity tooltip anchored above a character (desktop) or shown as
// a bottom sheet (touch). Light, small, never covers its target.

import { officeLabel } from "@/lib/config/offices";
import type { PublicProfile } from "@/lib/data/types";

export function PersonLabel({
  person,
  isSelf,
  x,
  y,
  asSheet,
  onClose,
}: {
  person: PublicProfile;
  isSelf: boolean;
  x: number;
  y: number;
  asSheet: boolean;
  onClose: () => void;
}) {
  const office = officeLabel(person.officeCode);
  const body = (
    <>
      <p className="font-pixel text-[8px] leading-relaxed">
        {person.displayName}
        {isSelf && <span className="ml-1.5 bg-pxcyan px-1 text-night">YOU</span>}
      </p>
      {office && <p className="font-mono text-[11px] text-night/70">{office}</p>}
    </>
  );

  if (asSheet) {
    return (
      <div
        role="dialog"
        aria-label={person.displayName}
        className="anim-sheet pixel-panel fixed inset-x-2 bottom-2 z-40 flex items-center justify-between gap-3 px-3 py-2 pb-[max(8px,env(safe-area-inset-bottom))]"
      >
        <div>{body}</div>
        <button
          type="button"
          className="pixel-btn pixel-btn-ghost pixel-btn-sm"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label={person.displayName}
      data-person-label
      className="anim-tooltip pixel-panel pointer-events-none absolute z-30 whitespace-nowrap px-2 py-1"
      style={{
        transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`,
        left: 0,
        top: 0,
        boxShadow: "2px 2px 0 0 rgba(13,13,13,0.85)",
      }}
    >
      {body}
    </div>
  );
}
