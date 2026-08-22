// The persistent WhatsApp worker. Run with `npm start` on Railway, Fly.io,
// or Render. Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
// WHATSAPP_AUTH_ENCRYPTION_KEY. Never deploy inside the Vercel app.

import { BaileysAdapter } from "./baileys";
import {
  claimNextJob,
  createDb,
  finishJob,
  getGroupConfig,
  getWaProfile,
  isOnBeach,
  setMembershipState,
  updateGroupConfig,
} from "./db";
import { env } from "./env";
import { log } from "./log";
import { processMembershipJob } from "./membership";
import { processVerificationSends } from "./verification";
import { reconcileGroup } from "./reconcile";

const db = createDb();
const adapter = new BaileysAdapter(db);
let groupJid: string | null = null;
let reconciling = false;

async function ensureGroupSafe(): Promise<string | null> {
  try {
    const group = await adapter.ensureGroup();
    groupJid = group.jid;
    return groupJid;
  } catch (e) {
    log.warn("ensure_group_failed", { message: String(e) });
    return null;
  }
}

async function pumpJobs() {
  if (!adapter.isConnected() || !groupJid) return;
  for (let i = 0; i < 5; i++) {
    const job = await claimNextJob(db);
    if (!job) return;
    try {
      await processMembershipJob(adapter, {
        job,
        groupJid,
        load: async () => {
          const wa = await getWaProfile(db, job.user_id);
          if (!wa) return null;
          return {
            onBeach: await isOnBeach(db, job.user_id),
            phoneE164: wa.phone_e164,
            phoneVerified: wa.phone_verified_at !== null,
            consented: wa.whatsapp_opt_in_at !== null,
            syncEnabled: wa.whatsapp_sync_enabled,
          };
        },
        setState: (state, errorCode) =>
          setMembershipState(db, job.user_id, state, errorCode ?? null),
        finish: (state, patch) => finishJob(db, job.id, state, patch),
        storeInvite: (url) => updateGroupConfig(db, { invite_url: url }),
        log: (event, fields) => log.info(event, fields as never),
      });
    } catch (e) {
      log.error("job_processing_error", { message: String(e) });
      await finishJob(db, job.id, "queued", {
        attempts: job.attempts + 1,
        locked_at: null,
        available_at: new Date(Date.now() + 30_000).toISOString(),
        last_error_code: "temporary",
      });
    }
  }
}

async function runReconcile() {
  if (reconciling || !groupJid) return;
  reconciling = true;
  try {
    await reconcileGroup(db, adapter, groupJid);
  } catch (e) {
    log.error("reconcile_failed", { message: String(e) });
  } finally {
    reconciling = false;
  }
}

async function pumpAdminCommands() {
  const { data: commands } = await db
    .from("whatsapp_admin_commands")
    .select("id, command")
    .is("handled_at", null)
    .limit(5);
  for (const cmd of commands ?? []) {
    log.info("admin_command", { command: cmd.command });
    if (cmd.command === "reconcile") await runReconcile();
    if (cmd.command === "retry_failed") {
      await db
        .from("whatsapp_membership_jobs")
        .update({
          state: "queued",
          attempts: 0,
          available_at: new Date().toISOString(),
          locked_at: null,
        })
        .eq("state", "failed");
    }
    if (cmd.command === "rotate_qr" || cmd.command === "disconnect_account") {
      // Both force a fresh session; the next connect issues a new QR.
      await updateGroupConfig(db, { connection_state: "action_required" });
    }
    await db
      .from("whatsapp_admin_commands")
      .update({ handled_at: new Date().toISOString() })
      .eq("id", cmd.id);
  }
}

async function main() {
  log.info("worker_starting", {});
  await getGroupConfig(db); // fail fast if migrations are missing
  adapter.onReconnected = () => {
    void ensureGroupSafe().then(() => runReconcile());
  };
  await adapter.connect();

  setInterval(() => void pumpJobs(), env.jobPollMs);
  setInterval(() => void processVerificationSends(db, adapter), env.jobPollMs);
  setInterval(() => void pumpAdminCommands(), 10_000);
  setInterval(() => void runReconcile(), env.reconcileIntervalMs);
}

// Baileys surfaces socket races as unhandled rejections; log and survive.
process.on("unhandledRejection", (e) => {
  log.error("unhandled_rejection", { message: String(e) });
});
process.on("uncaughtException", (e) => {
  log.error("uncaught_exception", { message: String(e) });
});

main().catch((e) => {
  log.error("worker_fatal", { message: String(e) });
  process.exit(1);
});
