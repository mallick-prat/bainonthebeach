// Privacy-conscious analytics hooks. Aggregate event names only; no names,
// emails, offices, character configs, or auth ids. No provider is wired by
// default; connect one here (e.g. a beacon to your collector) if wanted.

export type AnalyticsEvent =
  | "login_started"
  | "character_completed"
  | "joined_beach"
  | "left_beach"
  | "game_load_failed";

export function track(event: AnalyticsEvent) {
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[analytics] ${event}`);
  }
  // Intentionally no network call until a provider is configured.
}
