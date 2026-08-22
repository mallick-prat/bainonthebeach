"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  characterConfigSchema,
  randomCharacter,
  type CharacterConfig,
} from "@/lib/validation/character";
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
import type { Direction } from "@/game/sprites/characterSprites";
import { CharacterPreview } from "./CharacterPreview";
import { WhatsAppSection } from "./WhatsAppSection";
import { saveCharacterAction, type ActionResult } from "@/app/actions";
import type { SelfWhatsApp } from "@/lib/data/types";

const DIRS: Direction[] = ["south", "east", "north", "west"];

const LABELS: Record<string, string> = {
  none: "None",
  short: "Short",
  spiky: "Spiky",
  bob: "Bob",
  long: "Long",
  bun: "Bun",
  tee: "Tee",
  tank: "Tank",
  buttonup: "Button-up",
  shorts: "Shorts",
  pants: "Pants",
  trunks: "Trunks",
  sandals: "Sandals",
  sneakers: "Sneakers",
  barefoot: "Barefoot",
  visor: "Visor",
  strawhat: "Straw hat",
  sunglasses: "Sunglasses",
  snorkel: "Snorkel",
  tie: "The tie",
  floatring: "Float ring",
  laptop: "Laptop",
  drink: "Drink",
  surfboard: "Surfboard",
  tote: "Tote",
  beachball: "Beach ball",
  towel: "Towel",
};

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b-2 border-dotted border-night/15 pb-3 last:border-b-0 last:pb-0">
      <h2 className="font-pixel mb-2 text-[9px] text-night/70">{label}</h2>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-wide text-night/60">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`pixel-btn pixel-btn-sm ${selected ? "pixel-btn-primary" : "pixel-btn-ghost"}`}
    >
      {children}
    </button>
  );
}

function Swatches({
  colors,
  value,
  onChange,
  name,
}: {
  colors: readonly string[];
  value: number;
  onChange: (i: number) => void;
  name: string;
}) {
  return (
    <>
      {colors.map((color, i) => (
        <button
          key={color}
          type="button"
          className="pixel-swatch"
          style={{ background: color }}
          aria-label={`${name} ${i + 1}`}
          aria-pressed={value === i}
          data-selected={value === i}
          onClick={() => onChange(i)}
        />
      ))}
    </>
  );
}

export function CharacterCreator({
  initialName,
  initialConfig,
  firstTime,
  initialWhatsApp,
  demo,
}: {
  initialName: string;
  initialConfig: CharacterConfig;
  firstTime: boolean;
  initialWhatsApp: SelfWhatsApp;
  demo: boolean;
}) {
  const [config, setConfig] = useState<CharacterConfig>(initialConfig);
  const [name, setName] = useState(initialName);
  const [dirIndex, setDirIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = useMemo(
    () =>
      JSON.stringify(config) !== JSON.stringify(initialConfig) ||
      name !== initialName,
    [config, name, initialConfig, initialName],
  );

  // Unsaved-changes guard for tab close / navigation away.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const set = <K extends keyof CharacterConfig>(
    key: K,
    value: CharacterConfig[K],
  ) => setConfig((c) => ({ ...c, [key]: value }));

  const leave = (e: React.MouseEvent) => {
    if (dirty && !window.confirm("Leave without saving?")) {
      e.preventDefault();
    }
  };

  const save = () => {
    setError(null);
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Name your tiny self.");
      return;
    }
    const parsed = characterConfigSchema.safeParse(config);
    if (!parsed.success) {
      setError("That outfit does not exist here.");
      return;
    }
    startTransition(async () => {
      const res: ActionResult | void = await saveCharacterAction({
        displayName: trimmed,
        config: parsed.data,
      });
      if (res && !res.ok) setError(res.error);
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-3 pb-24 pt-2">
      <div className="mb-2 flex items-center gap-3">
        {firstTime ? (
          <span className="font-pixel text-[10px] text-pxyellow">
            MAKE YOUR CHARACTER
          </span>
        ) : (
          <>
            <Link
              href="/beach"
              onClick={leave}
              className="pixel-btn pixel-btn-dark pixel-btn-sm"
            >
              Back to beach
            </Link>
            <span className="font-pixel text-[10px] text-pxyellow">
              EDIT CHARACTER
            </span>
          </>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-[236px_1fr]">
        {/* Preview */}
        <div className="pixel-panel flex flex-row items-center justify-center gap-3 self-start p-3 md:sticky md:top-3 md:flex-col">
          <CharacterPreview
            config={config}
            direction={DIRS[dirIndex]!}
            scale={5}
          />
          <div className="flex flex-col gap-2 md:w-full">
            <div className="flex justify-center gap-2">
              <button
                type="button"
                className="pixel-btn pixel-btn-ghost pixel-btn-sm"
                aria-label="Turn left"
                onClick={() => setDirIndex((i) => (i + 3) % 4)}
              >
                {"<"}
              </button>
              <button
                type="button"
                className="pixel-btn pixel-btn-ghost pixel-btn-sm"
                aria-label="Turn right"
                onClick={() => setDirIndex((i) => (i + 1) % 4)}
              >
                {">"}
              </button>
            </div>
            <button
              type="button"
              className="pixel-btn pixel-btn-secondary pixel-btn-sm md:w-full"
              onClick={() => setConfig(randomCharacter())}
            >
              Randomize
            </button>
          </div>
        </div>

        {/* Options */}
        <div className="pixel-panel flex flex-col gap-4 p-4">
          <Section label="IDENTITY">
            <div className="grid gap-3">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="name"
                  className="font-mono text-[11px] uppercase tracking-wide text-night/60"
                >
                  Name
                </label>
                <input
                  id="name"
                  className="pixel-input"
                  value={name}
                  maxLength={32}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="nickname"
                />
              </div>
            </div>
            <WhatsAppSection
              initial={initialWhatsApp}
              demo={demo}
              hasProfile={!firstTime}
              getDraft={() => ({ displayName: name.trim(), config })}
            />
          </Section>

          <Section label="BODY">
            <Row label="Skin">
              <Swatches
                colors={SKIN_TONES}
                value={config.skin}
                onChange={(i) => set("skin", i)}
                name="Skin"
              />
            </Row>
          </Section>

          <Section label="HAIR">
            <Row label="Style">
              {HAIR_STYLES.map((s) => (
                <Chip
                  key={s}
                  selected={config.hairStyle === s}
                  onClick={() => set("hairStyle", s)}
                >
                  {LABELS[s]}
                </Chip>
              ))}
            </Row>
            <Row label="Color">
              <Swatches
                colors={HAIR_COLORS}
                value={config.hairColor}
                onChange={(i) => set("hairColor", i)}
                name="Hair color"
              />
            </Row>
          </Section>

          <Section label="OUTFIT">
            <Row label="Top">
              {TOP_STYLES.map((s) => (
                <Chip
                  key={s}
                  selected={config.topStyle === s}
                  onClick={() => set("topStyle", s)}
                >
                  {LABELS[s]}
                </Chip>
              ))}
            </Row>
            <Row label="Top color">
              <Swatches
                colors={CLOTH_COLORS}
                value={config.topColor}
                onChange={(i) => set("topColor", i)}
                name="Top color"
              />
            </Row>
            <Row label="Bottoms">
              {BOTTOM_STYLES.map((s) => (
                <Chip
                  key={s}
                  selected={config.bottomStyle === s}
                  onClick={() => set("bottomStyle", s)}
                >
                  {LABELS[s]}
                </Chip>
              ))}
            </Row>
            <Row label="Bottoms color">
              <Swatches
                colors={CLOTH_COLORS}
                value={config.bottomColor}
                onChange={(i) => set("bottomColor", i)}
                name="Bottoms color"
              />
            </Row>
            <Row label="Shoes">
              {SHOE_STYLES.map((s) => (
                <Chip
                  key={s}
                  selected={config.shoes === s}
                  onClick={() => set("shoes", s)}
                >
                  {LABELS[s]}
                </Chip>
              ))}
            </Row>
          </Section>

          <Section label="EXTRAS">
            <Row label="Accessory">
              {ACCESSORIES.map((s) => (
                <Chip
                  key={s}
                  selected={config.accessory === s}
                  onClick={() => set("accessory", s)}
                >
                  {LABELS[s]}
                </Chip>
              ))}
            </Row>
            <Row label="Prop">
              {PROPS.map((s) => (
                <Chip
                  key={s}
                  selected={config.prop === s}
                  onClick={() => set("prop", s)}
                >
                  {LABELS[s]}
                </Chip>
              ))}
            </Row>
          </Section>
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-pxwhite/20 bg-night/95 p-2 pb-[max(8px,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-end gap-2 px-1">
          <p
            role="status"
            aria-live="polite"
            className="mr-auto font-mono text-sm text-pxred"
          >
            {error}
          </p>
          {!firstTime && (
            <Link
              href="/beach"
              onClick={leave}
              className="pixel-btn pixel-btn-dark pixel-btn-sm"
            >
              Back to beach
            </Link>
          )}
          <button
            type="button"
            className="pixel-btn pixel-btn-primary"
            disabled={pending}
            onClick={save}
          >
            {pending ? "Saving..." : "Save character"}
          </button>
        </div>
      </div>
    </div>
  );
}
