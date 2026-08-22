import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

export const env = {
  supabaseUrl: required("SUPABASE_URL"),
  /** Service-role key. Server-only; never ships to any browser bundle. */
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  /** 32-byte hex key for AES-256-GCM encryption of Baileys auth state. */
  authEncryptionKey: required("WHATSAPP_AUTH_ENCRYPTION_KEY"),
  reconcileIntervalMs: Number(process.env.RECONCILE_INTERVAL_MS ?? 15 * 60_000),
  jobPollMs: Number(process.env.JOB_POLL_MS ?? 5_000),
  /** Print the QR to the worker terminal too (local development). */
  qrToTerminal: process.env.QR_TO_TERMINAL === "1",
};
