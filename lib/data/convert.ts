// Row -> PublicProfile conversion shared by the server data layer and the
// browser realtime reconciler. Safe for both bundles.

import { migrateCharacterConfig } from "@/lib/validation/character";
import type { PublicProfile } from "./types";

export interface ProfileRow {
  id: string;
  display_name: string;
  office_code: string | null;
  character_config: unknown;
  character_schema_version: number;
  on_beach: boolean;
  on_beach_since: string | null;
}

export function rowToProfile(row: ProfileRow): PublicProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    officeCode: row.office_code,
    // A config from a future schema version renders as null -> safe default.
    characterConfig: migrateCharacterConfig(
      row.character_config,
      row.character_schema_version,
    ),
    characterSchemaVersion: row.character_schema_version,
    onBeach: row.on_beach,
    onBeachSince: row.on_beach_since,
  };
}
