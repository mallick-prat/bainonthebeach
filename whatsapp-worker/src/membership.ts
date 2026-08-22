// Membership job processing. Idempotent, convergent, classified retries.
// Pure enough to be tested with the fake adapter (see tests/unit).

import {
  classifyParticipantStatus,
  desiredMembership,
  isRetryable,
  MAX_JOB_ATTEMPTS,
  retryDelayMs,
} from "../../lib/whatsapp/membership";
import { phoneToWhatsAppJid } from "../../lib/whatsapp/phone";
import type { WhatsAppAdapter } from "./adapter";

export interface JobContext {
  job: {
    id: string;
    user_id: string;
    phone_e164: string;
    desired_membership: boolean;
    attempts: number;
  };
  groupJid: string;
  /** Authoritative reload of the user's CURRENT state (not the job's). */
  load: () => Promise<{
    onBeach: boolean;
    phoneE164: string | null;
    phoneVerified: boolean;
    consented: boolean;
    syncEnabled: boolean;
  } | null>;
  setState: (state: string, errorCode?: string | null) => Promise<void>;
  finish: (
    state: "done" | "failed" | "superseded" | "queued",
    patch?: Record<string, unknown>,
  ) => Promise<void>;
  storeInvite: (url: string) => Promise<void>;
  log: (event: string, fields?: Record<string, unknown>) => void;
}

/**
 * Processes one claimed membership job against the adapter. Reloads the
 * authoritative state first so rapid ON/OFF/ON toggles converge on the
 * final truth instead of replaying stale intermediate jobs.
 */
export async function processMembershipJob(
  adapter: WhatsAppAdapter,
  ctx: JobContext,
): Promise<void> {
  const { job } = ctx;

  const current = await ctx.load();
  if (!current) {
    // Profile deleted: the only valid action is removal.
    if (!job.desired_membership) {
      await executeRemove(adapter, ctx, job.phone_e164);
      return;
    }
    await ctx.finish("superseded");
    return;
  }

  const desired = desiredMembership({
    phoneVerified: current.phoneVerified,
    consented: current.consented,
    syncEnabled: current.syncEnabled,
    onBeach: current.onBeach,
  });

  // Disconnect jobs (desired=false) still run when eligibility was revoked.
  const effectiveDesired = desired ?? (job.desired_membership ? null : false);
  if (effectiveDesired === null) {
    await ctx.finish("superseded");
    return;
  }
  if (effectiveDesired !== job.desired_membership) {
    ctx.log("job_superseded_by_current_state", { jobId: job.id });
    await ctx.finish("superseded");
    return;
  }
  // The phone may have changed since the job was written; the job's phone
  // is authoritative for removals (old number must leave), the profile's
  // phone for additions.
  const phone = effectiveDesired
    ? (current.phoneE164 ?? job.phone_e164)
    : job.phone_e164;

  if (effectiveDesired) {
    await executeAdd(adapter, ctx, phone);
  } else {
    await executeRemove(adapter, ctx, phone);
  }
}

async function executeAdd(
  adapter: WhatsAppAdapter,
  ctx: JobContext,
  phone: string,
) {
  const jid = phoneToWhatsAppJid(phone);
  const members = await adapter.getGroupMembers(ctx.groupJid);
  if (members.some((m) => sameUser(m, jid))) {
    // Already a member: success.
    await ctx.setState("member", null);
    await ctx.finish("done");
    return;
  }
  const identity = await adapter.checkNumber(phone);
  if (!identity) {
    await ctx.setState("failed", "not_on_whatsapp");
    await ctx.finish("failed", { last_error_code: "not_on_whatsapp" });
    return;
  }
  const [result] = await adapter.addParticipants(ctx.groupJid, [identity.jid]);
  const cls = classifyParticipantStatus(result?.status ?? "500");
  if (cls === "ok") {
    await ctx.setState("member", null);
    await ctx.finish("done");
    ctx.log("membership_added", { userId: ctx.job.user_id });
    return;
  }
  if (cls === "invite_required") {
    // Privacy settings block direct adds: stop retrying, surface the invite.
    const invite = await adapter.getInviteLink(ctx.groupJid);
    await ctx.storeInvite(invite);
    await ctx.setState("invite_required", "invite_required");
    await ctx.finish("done", { last_error_code: "invite_required" });
    ctx.log("membership_invite_required", { userId: ctx.job.user_id });
    return;
  }
  await handleFailure(ctx, cls);
}

async function executeRemove(
  adapter: WhatsAppAdapter,
  ctx: JobContext,
  phone: string,
) {
  const jid = phoneToWhatsAppJid(phone);
  const members = await adapter.getGroupMembers(ctx.groupJid);
  const present = members.find((m) => sameUser(m, jid));
  if (!present) {
    // Already absent: success.
    await ctx.setState("not_member", null);
    await ctx.finish("done");
    return;
  }
  const [result] = await adapter.removeParticipants(ctx.groupJid, [present]);
  const cls = classifyParticipantStatus(result?.status ?? "500");
  if (cls === "ok" || cls === "not_on_whatsapp") {
    await ctx.setState("not_member", null);
    await ctx.finish("done");
    ctx.log("membership_removed", { userId: ctx.job.user_id });
    return;
  }
  await handleFailure(ctx, cls);
}

async function handleFailure(ctx: JobContext, cls: string) {
  const attempts = ctx.job.attempts + 1;
  if (isRetryable(cls as never) && attempts < MAX_JOB_ATTEMPTS) {
    await ctx.finish("queued", {
      attempts,
      locked_at: null,
      last_error_code: cls,
      available_at: new Date(Date.now() + retryDelayMs(attempts)).toISOString(),
    });
    ctx.log("membership_retry_scheduled", { code: cls, attempts });
    return;
  }
  await ctx.setState("failed", cls);
  await ctx.finish("failed", { attempts, last_error_code: cls });
  ctx.log("membership_sync_failed", { code: cls });
}

/** Compares JIDs by user part (device suffixes differ). */
export function sameUser(a: string, b: string): boolean {
  const user = (j: string) => j.split("@")[0]?.split(":")[0] ?? j;
  return user(a) === user(b);
}
