// Authoritative game palette. Keep the whole rendered world inside these
// colors plus the skin tones. No pure black, no gradients.

export const PAL = {
  black: "#0d0d0d",
  white: "#fcfcfc",
  green: "#00a800",
  greenDark: "#007800",
  red: "#e40058",
  blue: "#0058f8",
  yellow: "#f8d800",
  cyan: "#00e8d8",
  orange: "#f87800",
  sand: "#f0d890",
  sandDark: "#d8b860",
  wood: "#a05018",
  charcoal: "#282828",
  brown: "#804828",
  // Brand accent from the Bain brand guide (logo.dev), used only for
  // branded elements: the building sign, the lawn banner, primary actions.
  bainRed: "#b41313",
} as const;

// Skin tones, presented in the creator as plain swatches without labels.
export const SKIN_TONES = [
  "#ffe0c0",
  "#f0c8a0",
  "#d8a070",
  "#b07040",
  "#804828",
  "#5c3020",
] as const;

// Shaded variant used for simple depth on each skin tone.
export const SKIN_SHADES = [
  "#e0b890",
  "#d0a078",
  "#b08050",
  "#905828",
  "#603418",
  "#442014",
] as const;

// Clothing colors shared by tops and bottoms.
export const CLOTH_COLORS = [
  PAL.red,
  PAL.blue,
  PAL.yellow,
  PAL.cyan,
  PAL.orange,
  PAL.green,
  PAL.white,
  PAL.charcoal,
] as const;

export const HAIR_COLORS = [
  PAL.charcoal,
  PAL.brown,
  PAL.yellow,
  PAL.orange,
  PAL.white,
  PAL.blue,
] as const;

export const HAIR_STYLES = [
  "none",
  "short",
  "spiky",
  "bob",
  "long",
  "bun",
] as const;
export const TOP_STYLES = ["tee", "tank", "buttonup"] as const;
export const BOTTOM_STYLES = ["shorts", "pants", "trunks"] as const;
export const SHOE_STYLES = ["sandals", "sneakers", "barefoot"] as const;
export const ACCESSORIES = [
  "none",
  "visor",
  "strawhat",
  "sunglasses",
  "snorkel",
  "tie",
  "floatring",
] as const;
export const PROPS = [
  "none",
  "laptop",
  "drink",
  "surfboard",
  "tote",
  "beachball",
  "towel",
] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type TopStyle = (typeof TOP_STYLES)[number];
export type BottomStyle = (typeof BOTTOM_STYLES)[number];
export type ShoeStyle = (typeof SHOE_STYLES)[number];
export type Accessory = (typeof ACCESSORIES)[number];
export type Prop = (typeof PROPS)[number];
