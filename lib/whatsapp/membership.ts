// Membership decision logic and error classification, shared by the web
// app (for display) and the worker (for action). Pure and unit tested.

export const CONSENT_VERSION = "2026-08-22.v1";

export const CONSENT_COPY =
  "Add me to the Bain on the Beach WhatsApp group when I am on the beach. " +
  "Remove me when I leave the beach. Other group members will be able to see my phone number.";

export type MembershipState =
  | "not_connected"
  | "verification_pending"
  | "queued"
  | "syncing"
  | "member"
  | "not_member"
  | "invite_required"
  | "failed";

export interface SyncEligibility {
  phoneVerified: boolean;
  consented: boolean;
  syncEnabled: boolean;
  onBeach: boolean;
}

/**
 * The single source of truth for "should this user be in the group".
 * null = no sync action at all (user is not connected/eligible).
 */
export function desiredMembership(e: SyncEligibility): boolean | null {
  if (!e.phoneVerified || !e.consented || !e.syncEnabled) return null;
  return e.onBeach;
}

export type SyncErrorClass =
  | "temporary"
  | "invite_required"
  | "invalid_number"
  | "not_on_whatsapp"
  | "permission_failure"
  | "group_configuration_failure"
  | "permanent";

/** Whether a job with this classification should be retried. */
export function isRetryable(cls: SyncErrorClass): boolean {
  return cls === "temporary" || cls === "group_configuration_failure";
}

/** Baileys participant status codes -> our classification. */
export function classifyParticipantStatus(
  status: string | number,
): SyncErrorClass | "ok" {
  const code = String(status);
  switch (code) {
    case "200":
      return "ok";
    case "403": // privacy settings require an invite
      return "invite_required";
    case "408": // recently left; retry later
    case "500":
      return "temporary";
    case "401": // not on whatsapp / bad target
    case "404":
      return "not_on_whatsapp";
    case "409": // already in group: treated as success by callers
      return "ok";
    default:
      return "temporary";
  }
}

/** Bounded exponential backoff with jitter, in milliseconds. */
export function retryDelayMs(
  attempts: number,
  rand: () => number = Math.random,
): number {
  const base = Math.min(15 * 60_000, 5_000 * 2 ** Math.max(0, attempts - 1));
  return Math.round(base * (0.7 + rand() * 0.6));
}

export const MAX_JOB_ATTEMPTS = 8;
