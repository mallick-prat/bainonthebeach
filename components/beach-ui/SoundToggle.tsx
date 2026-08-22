"use client";

// Optional soundscape. Never autoplays: the stored preference only takes
// effect after a user gesture (this toggle). Several tracks; flip back and
// forth with the arrows.

import { useEffect, useState } from "react";
import {
  changeTrack,
  currentTrack,
  isSoundOn,
  setSound,
  setTrack,
  trackName,
} from "@/game/audio/chiptune";

const PREF_KEY = "botb-sound";
const TRACK_KEY = "botb-track";

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden shapeRendering="crispEdges">
      <rect x="1" y="5" width="3" height="4" fill="currentColor" />
      <rect x="4" y="3" width="2" height="8" fill="currentColor" />
      <rect x="6" y="1" width="2" height="12" fill="currentColor" />
      {muted ? (
        <>
          <rect x="9" y="4" width="2" height="2" fill="currentColor" />
          <rect x="11" y="6" width="2" height="2" fill="currentColor" />
          <rect x="9" y="8" width="2" height="2" fill="currentColor" />
        </>
      ) : (
        <>
          <rect x="9" y="5" width="1" height="4" fill="currentColor" />
          <rect x="10" y="3" width="1" height="2" fill="currentColor" />
          <rect x="10" y="9" width="1" height="2" fill="currentColor" />
          <rect x="11" y="5" width="1" height="4" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export function SoundToggle() {
  const [on, setOn] = useState(false);
  const [name, setName] = useState("SUNNY LOOP");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = Number(window.localStorage.getItem(TRACK_KEY) ?? "0");
      if (Number.isFinite(stored)) setTrack(stored);
      setName(trackName());
      setOn(isSoundOn());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggle = async () => {
    const next = !on;
    setOn(next);
    window.localStorage.setItem(PREF_KEY, next ? "on" : "off");
    await setSound(next);
    setOn(isSoundOn());
  };

  const flip = (dir: 1 | -1) => {
    setName(changeTrack(dir));
    window.localStorage.setItem(TRACK_KEY, String(currentTrack()));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        className="pixel-btn pixel-btn-dark pixel-btn-sm w-full justify-start"
        aria-pressed={on}
        onClick={toggle}
      >
        <SpeakerIcon muted={!on} />
        <span>{on ? "Sound on" : "Sound off"}</span>
      </button>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="pixel-btn pixel-btn-dark pixel-btn-sm"
          aria-label="Previous track"
          onClick={() => flip(-1)}
        >
          {"<"}
        </button>
        <span className="font-pixel flex-1 truncate text-center text-[7px] text-pxwhite/80">
          {name}
        </span>
        <button
          type="button"
          className="pixel-btn pixel-btn-dark pixel-btn-sm"
          aria-label="Next track"
          onClick={() => flip(1)}
        >
          {">"}
        </button>
      </div>
    </div>
  );
}
