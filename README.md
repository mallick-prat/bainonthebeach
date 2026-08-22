# Bain on the Beach

A tiny pixel-game microsite. Sign in, build a 20x28 pixel consultant, declare
whether you are on the beach, and watch yourself wander a shared island with
everyone else who is. Joining the beach can also add your number to the one
persistent "Bain on the Beach" WhatsApp group; leaving removes it. That is
the whole joke.

Live: https://bainonthebeach.vercel.app (demo mode until Supabase is wired).

## Stack

- Next.js (App Router) + TypeScript strict + Tailwind
- PixiJS for the island canvas (all art is code-drawn pixel work)
- Supabase: auth (Google OAuth + email code), Postgres + RLS, realtime
- Demo mode: with no Supabase env vars the app runs entirely locally with
  fixture beachgoers, local sign-in, and simulated WhatsApp (code 424242)
- Zod shared validation, Vitest, Playwright
- A separate persistent Node worker (whatsapp-worker/) drives WhatsApp via
  Baileys; see whatsapp-worker/README.md

## Commands

```bash
npm run dev          # dev server (demo mode without env vars)
npm run build        # production build
npm run start        # serve the production build
npm run lint         # eslint
npm run typecheck    # tsc
npm test             # vitest unit suite
npm run test:e2e     # playwright (demo mode; unique fixtures per run)
npm run format:check # prettier
npm run gen:cursors  # regenerate the pixel cursor PNGs
```

## Local development

```bash
npm install
npm run dev
```

No env vars needed: demo mode gives you sign-in with any email, nine fixture
beachgoers, and the simulated WhatsApp flow (verification code 424242).

## Supabase setup (production)

1. Create a project at supabase.com.
2. Apply migrations: `supabase db push`, or paste
   `supabase/migrations/0001_profiles.sql` then `0002_whatsapp.sql` into the
   SQL editor. `supabase/seed.sql` is for LOCAL stacks only.
3. Auth providers: enable Email (OTP/magic link); optionally Google OAuth.
4. Auth redirect URLs: add `http://localhost:3000/auth/callback`,
   `https://<production-domain>/auth/callback`, and the Vercel preview
   wildcard `https://*-<team>.vercel.app/auth/callback`. Preview deployments
   work but the apex domain is the canonical auth origin.
5. Env vars (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and optionally `ALLOWED_EMAIL_DOMAINS`
   (comma-separated; unset = any domain in dev; malformed = fail closed in
   production). The domain check is enforced server-side in the auth
   callback and every mutation.
6. WhatsApp admins: `insert into whatsapp_admins (email) values (...)` to
   unlock `/admin/whatsapp`.

No service-role key exists anywhere in the web app. Only the worker uses it.

## Deployment (Vercel)

- `vercel deploy --prod` (already configured; the current production alias
  is https://bainonthebeach.vercel.app).
- Set the Supabase env vars in the Vercel project (Production and Preview).
- For bainonthebeach.com: add the apex domain in Vercel's domain UI, point
  DNS at the records Vercel shows there, keep www redirecting to the apex,
  and add the apex callback URL in Supabase.
- The WhatsApp worker deploys separately (Railway/Fly/Render), never on
  Vercel: whatsapp-worker/README.md has the steps.

## Security notes

- RLS: authenticated users read the shared island shape only; a user can
  insert/update only their own profile; column grants stop clients from
  touching ids, timestamps, or the on-beach pair directly (status changes go
  through the atomic `set_beach_status` function, which also enqueues
  WhatsApp sync in the same transaction).
- Phone numbers live in `whatsapp_profiles` (owner-readable only) and in
  worker-only tables. They never appear in public queries, realtime
  payloads, logs, or analytics. Group members will see each other's numbers
  inside WhatsApp; the consent copy says exactly that and is opt-in.
- Rate limits cover character saves, status toggles, phone saves, and code
  attempts (in-memory per instance; swap in Upstash for cross-instance
  guarantees). Supabase applies its own email-send limits.
- Security headers (CSP compatible with Supabase + the canvas, nosniff,
  frame deny, referrer + permissions policies) are set in next.config.ts.

## Account deletion (admin path)

Delete the auth user in the Supabase dashboard (or
`select auth.admin_delete_user(...)`). The profile cascades; a trigger
records the WhatsApp group-removal job BEFORE the phone row disappears, so
the worker still removes them from the group afterwards.

## Docs

- docs/architecture.md: auth, data boundaries, deterministic movement,
  realtime reconciliation, sharding, rendering, accessibility, WhatsApp sync
- public/assets/ATTRIBUTION.md + docs/asset-manifest.json: asset provenance
- whatsapp-worker/README.md: dedicated account, QR pairing, deployment
