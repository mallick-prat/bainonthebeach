// The status invariant, as one pure function used by the demo store and
// mirrored by the SQL function set_beach_status + check constraint:
// on_beach_since is non-null exactly when on_beach is true.

export interface StatusFields {
  onBeach: boolean;
  onBeachSince: string | null;
}

export function applyStatus(join: boolean, now: Date): StatusFields {
  return {
    onBeach: join,
    onBeachSince: join ? now.toISOString() : null,
  };
}

export function statusIsConsistent(fields: StatusFields): boolean {
  return fields.onBeach ? fields.onBeachSince !== null : fields.onBeachSince === null;
}
