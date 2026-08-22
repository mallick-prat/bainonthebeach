# Architecture

## Auth and data boundaries

- Server components do all route protection (`getSessionUser()` per page);
  there is no middleware to trust.
- Two modes behind one data layer (`lib/data/*`): Supabase (auth cookies via
  @supabase/ssr, RLS-scoped queries) and demo mode (no env vars: local
  cookie session, in-process fixture store, simulated WhatsApp).
- The browser only ever receives `PublicProfile`: id, display name,
  character config, schema version, on-beach flag and since-timestamp.
  Emails and phone numbers never leave the server. The user's own WhatsApp
  state (last four digits, membership state) comes from `/api/whatsapp/me`.
- The email-domain allowlist is parsed with a real URL parser and enforced
  server-side in the auth callback and in every mutation; malformed lists
  fail closed in production.

## Deterministic movement

No coordinates cross the network. Each immutable user id is FNV-1a hashed
into a route index, phase offset, walking speed (10..16 px/s), pause scale,
and a small separation offset. `characterStateAt(id, unixMs)` builds the
route's walk/pause timeline and evaluates it at `t mod period`, so every
client computes the same position for the same wall-clock second. Clock
jumps, sleep/resume, and dropped frames self-recover because position is a
pure function of time. Reduced motion freezes everyone at a stable point on
their route. Routes are closed loops in `game/world/geometry.ts`; a unit
suite proves every interpolated sample stays on land and clear of every
prop blocker.

## World and rendering

- The island is a superellipse with a chunky stepped coast, centered in
  open ocean (560x400 world px). The ground painter computes a land mask
  and a two-pass chamfer distance transform, which gives foam, shallows,
  wet sand, and deep-water waves that wrap the entire coastline.
- All art is code-drawn: 20x28 paper-doll characters composed from ASCII
  pixel grids (body + hair + outfit + accessory + prop layers, palette
  resolved per config, automatic outer outline), and fillRect props
  (building with brand sign, lawn banner, palms, umbrellas, loungers,
  tables, shrubs).
- PixiJS v8 renders at world resolution and scales with nearest-neighbor.
  The camera covers the stage (edges are ocean, so cover-cropping only
  crops water), zooms toward the cursor on ctrl/pinch scroll, pans by
  drag, and click-to-follow zooms in and tracks the selected character;
  clicking empty sand resets to the full view.
- Characters and props z-sort by foot line. Texture variants are cached by
  config+direction+pose+outline. The ticker pauses in hidden tabs. If
  Pixi/WebGL fails, a static 2D fallback of the same scene renders and the
  directory remains the interface.

## Realtime reconciliation

The server renders an authoritative snapshot; the client subscribes to
`profiles` postgres_changes and folds insert/update/delete into a keyed
store (the same id never duplicates, so multi-tab users render once). On
reconnect after an error the client re-fetches the snapshot instead of
trusting missed events; if realtime stays down it falls back to a
30-second poll (15s in demo mode). Signing out in another tab redirects
via `onAuthStateChange`.

## Sharding

Up to 120 on-beach people share one island. Beyond that,
`shardFor(userId, utcDay, count)` assigns stable daily shards (~80 each);
a selector switches islands and the directory still lists and searches
everyone. Assignment never changes on reload.

## WhatsApp synchronization

The database is authoritative. `set_beach_status` updates the status and
enqueues a membership job in one transaction; stale queued jobs are
superseded so ON/OFF/ON converges. A separate persistent worker
(whatsapp-worker/) owns the Baileys socket behind a `WhatsAppAdapter`
interface (tests use a fake), stores encrypted auth state in Postgres,
sends verification codes (bcrypt hashes only), processes the outbox with
classified retries and bounded backoff, serves the invite flow when user
privacy settings block direct adds, and reconciles actual group membership
every 15 minutes. Phone numbers stay in owner-only or worker-only tables;
the web app holds no service-role key and every privileged operation is a
SECURITY DEFINER SQL function that checks `auth.uid()`.

## Accessibility

Every action exists in semantic DOM: the WHO'S HERE drawer (right-side
panel or bottom sheet) mirrors the canvas with keyboard navigation, a
focus trap, and Escape handling; arrow keys cycle characters from the
stage; tooltips clamp to the viewport and flip below the feet rather than
covering their target; status is text + dot, never color alone; the sound
control is opt-in with a persistent preference; reduced motion is honored
everywhere; touch targets are 44px on coarse pointers.
