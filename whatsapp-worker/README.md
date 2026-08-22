# WhatsApp worker

Long-running Node service that keeps the single persistent WhatsApp group
"Bain on the Beach" in sync with beach status. Runs on Railway, Fly.io,
Render, or any persistent Node host. It cannot run on Vercel: Baileys needs
a durable connection and durable credentials.

Baileys is an UNOFFICIAL WhatsApp client. WhatsApp may restrict accounts
that use automated clients. Use a dedicated number, never an employee's
personal account.

## What it does

- Maintains the Baileys connection; auth state is stored AES-256-GCM
  encrypted in Postgres (`whatsapp_auth_state`), so restarts and ephemeral
  filesystems are fine.
- Creates or discovers the one group (subject "Bain on the Beach"), stores
  its JID, and never identifies it by name afterwards.
- Sends phone-verification codes (hash stored, 10-minute expiry).
- Processes the `whatsapp_membership_jobs` outbox: joins the beach -> the
  verified, consenting user's number is added to the group; leaves the
  beach -> removed. Already-member/already-absent count as success. Stale
  jobs are superseded so rapid toggles converge.
- Privacy-restricted users (WhatsApp blocks admin adds) get the invite
  flow; the app shows JOIN WHATSAPP GROUP instead of pretending they were
  added.
- Reconciles actual group membership against the database at startup, on
  reconnect, and every 15 minutes: adds missing members, removes
  off-the-beach or revoked-consent members (invite-link rejoins included),
  flags unknown members, never removes the dedicated account or admins.

## Setup

1. Apply the migrations in `../supabase/migrations/` to the Supabase
   project (`supabase db push` or the SQL editor).
2. `cp .env.example .env` and fill in:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Settings > API)
   - `WHATSAPP_AUTH_ENCRYPTION_KEY` (generate per the comment)
3. `npm install && npm start`
4. Pair the dedicated account: with `QR_TO_TERMINAL=1` the QR prints here;
   it is also served (short-lived, authenticated) on `/admin/whatsapp` in
   the web app. Scan with WhatsApp > Linked Devices on the dedicated phone.
5. Add administrator emails to the `whatsapp_admins` table:
   `insert into whatsapp_admins (email) values ('you@example.com');`

## Deployment (Railway example)

- New service from this repo, root directory `whatsapp-worker`.
- Start command `npm start`; set the three env vars.
- One instance only (job claiming assumes a single dedicated worker).

## Operations

- `/admin/whatsapp` shows connection state, group health, job counts, the
  pairing QR when needed, and RETRY FAILED JOBS / RECONCILE GROUP /
  DISCONNECT ACCOUNT controls.
- Session revoked or logged out: credentials are wiped automatically and
  the worker waits for a fresh QR scan.
- Group deleted or admin rights lost: state becomes ACTION REQUIRED;
  re-promote the dedicated account or let `ensureGroup` recreate.
- Disconnecting a user retains their verified number but clears consent
  and disables sync (documented data policy; deleting the profile removes
  the number after the group-removal job is recorded).
- Logs are structured (pino) with phone numbers, JIDs, codes, and links
  redacted. `membership_sync_failed userId=... code=INVITE_REQUIRED` is
  the shape to expect.
