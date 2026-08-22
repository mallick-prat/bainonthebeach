-- WhatsApp group synchronization: private phone profiles, verification,
-- the single persistent group, a durable membership outbox, admin controls,
-- and encrypted worker auth state.
--
-- Phone numbers are PRIVATE operational data. They live only in
-- whatsapp_profiles (readable by the owner alone) and in worker-only tables
-- with no client policies at all. The public profiles table and realtime
-- stream never carry them.

create extension if not exists pgcrypto;

/* ------------------------------------------------------------------ */
/* Private per-user WhatsApp profile                                   */
/* ------------------------------------------------------------------ */

create table public.whatsapp_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone_e164 text unique,
  phone_country_code text,
  phone_last_four text,
  phone_verified_at timestamptz,
  whatsapp_opt_in_at timestamptz,
  whatsapp_consent_version text,
  whatsapp_sync_enabled boolean not null default false,
  whatsapp_membership_state text not null default 'not_connected'
    check (
      whatsapp_membership_state in (
        'not_connected', 'verification_pending', 'queued', 'syncing',
        'member', 'not_member', 'invite_required', 'failed'
      )
    ),
  whatsapp_membership_error text,
  whatsapp_membership_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phone_e164_format check (
    phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{5,14}$'
  )
);

alter table public.whatsapp_profiles enable row level security;

-- Owner may READ their own row. All writes go through the SECURITY DEFINER
-- functions below, so there are deliberately no insert/update policies.
create policy wa_profiles_select_own
  on public.whatsapp_profiles for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.whatsapp_profiles from anon;

create trigger wa_profiles_updated_at
  before update on public.whatsapp_profiles
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------ */
/* Group configuration (one persistent group) — worker/service only    */
/* ------------------------------------------------------------------ */

create table public.whatsapp_group_config (
  id text primary key default 'bain_on_the_beach',
  group_jid text unique,
  subject text not null default 'Bain on the Beach',
  -- The invite link is user-deliverable data: it is gated by
  -- whatsapp_get_invite() below rather than encrypted, unlike credentials.
  invite_url text,
  connection_state text not null default 'disconnected',
  connected_account_name text,
  last_connected_at timestamptz,
  member_count integer,
  qr_data text,
  qr_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_reconciled_at timestamptz
);

alter table public.whatsapp_group_config enable row level security;
-- No policies: only the service role (worker) touches this table directly.
revoke all on public.whatsapp_group_config from anon, authenticated;

insert into public.whatsapp_group_config (id) values ('bain_on_the_beach');

create trigger wa_group_config_updated_at
  before update on public.whatsapp_group_config
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------ */
/* Durable membership outbox                                           */
/* ------------------------------------------------------------------ */

create table public.whatsapp_membership_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  phone_e164 text not null,
  desired_membership boolean not null,
  idempotency_key text not null unique,
  state text not null default 'queued'
    check (state in ('queued', 'running', 'done', 'failed', 'superseded')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wa_jobs_pickup_idx
  on public.whatsapp_membership_jobs (state, available_at)
  where state = 'queued';
create index wa_jobs_user_idx on public.whatsapp_membership_jobs (user_id);

alter table public.whatsapp_membership_jobs enable row level security;
revoke all on public.whatsapp_membership_jobs from anon, authenticated;

create trigger wa_jobs_updated_at
  before update on public.whatsapp_membership_jobs
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------------------ */
/* Verification codes (hashes only) — worker/service only              */
/* ------------------------------------------------------------------ */

create table public.whatsapp_verification_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phone_e164 text not null,
  code_hash text,
  send_state text not null default 'pending'
    check (send_state in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now()
);

create index wa_codes_user_idx on public.whatsapp_verification_codes (user_id);

alter table public.whatsapp_verification_codes enable row level security;
revoke all on public.whatsapp_verification_codes from anon, authenticated;

/* ------------------------------------------------------------------ */
/* Admin allowlist + command queue                                     */
/* ------------------------------------------------------------------ */

create table public.whatsapp_admins (
  email text primary key
);

alter table public.whatsapp_admins enable row level security;
revoke all on public.whatsapp_admins from anon, authenticated;

create table public.whatsapp_admin_commands (
  id uuid primary key default gen_random_uuid(),
  command text not null check (
    command in ('reconcile', 'retry_failed', 'disconnect_account', 'rotate_qr')
  ),
  requested_by uuid,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

alter table public.whatsapp_admin_commands enable row level security;
revoke all on public.whatsapp_admin_commands from anon, authenticated;

/* ------------------------------------------------------------------ */
/* Encrypted Baileys auth state — worker/service only                  */
/* ------------------------------------------------------------------ */

create table public.whatsapp_auth_state (
  key text primary key,
  value_encrypted text not null,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_auth_state enable row level security;
revoke all on public.whatsapp_auth_state from anon, authenticated;

/* ------------------------------------------------------------------ */
/* Functions (SECURITY DEFINER; the web app holds no service key)      */
/* ------------------------------------------------------------------ */

create function public.whatsapp_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.whatsapp_admins a
    join auth.users u on lower(u.email) = lower(a.email)
    where u.id = auth.uid()
  );
$$;

-- Internal: converge the outbox with the authoritative desired state.
create function public.whatsapp_enqueue_membership(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wa record;
  v_on_beach boolean;
  v_desired boolean;
begin
  select * into v_wa from whatsapp_profiles where user_id = p_user_id;
  if v_wa is null
     or v_wa.phone_verified_at is null
     or v_wa.whatsapp_opt_in_at is null
     or not v_wa.whatsapp_sync_enabled
     or v_wa.phone_e164 is null then
    return;
  end if;
  select on_beach into v_on_beach from profiles where id = p_user_id;
  v_desired := coalesce(v_on_beach, false);

  -- Rapid ON/OFF/ON toggles converge: stale queued jobs are superseded and
  -- exactly one job carries the final desired state.
  update whatsapp_membership_jobs
  set state = 'superseded'
  where user_id = p_user_id and state = 'queued';

  insert into whatsapp_membership_jobs
    (user_id, phone_e164, desired_membership, idempotency_key)
  values (
    p_user_id, v_wa.phone_e164, v_desired,
    p_user_id::text || ':' || v_desired::text || ':'
      || floor(extract(epoch from clock_timestamp()) * 1000)::text
  );

  update whatsapp_profiles
  set whatsapp_membership_state = 'queued',
      whatsapp_membership_updated_at = now()
  where user_id = p_user_id
    and whatsapp_membership_state not in ('invite_required');
end;
$$;

revoke execute on function public.whatsapp_enqueue_membership(uuid)
  from public, anon, authenticated;

-- Replace the status function: status change + membership job are one
-- transaction, and the beach control never waits on WhatsApp.
create or replace function public.set_beach_status(p_on_beach boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  update public.profiles
  set
    on_beach = p_on_beach,
    on_beach_since = case when p_on_beach then now() else null end
  where id = auth.uid();
  if not found then
    raise exception 'no_profile';
  end if;
  perform whatsapp_enqueue_membership(auth.uid());
end;
$$;

-- Save/replace a phone number and queue a verification send.
create function public.whatsapp_request_verification(
  p_phone_e164 text,
  p_country_code text,
  p_consent_version text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_recent integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_phone_e164 is null or p_phone_e164 !~ '^\+[1-9][0-9]{5,14}$' then
    raise exception 'invalid_phone';
  end if;
  if p_consent_version is null then raise exception 'consent_required'; end if;
  if exists (
    select 1 from whatsapp_profiles
    where phone_e164 = p_phone_e164 and user_id <> v_uid
  ) then
    raise exception 'duplicate_number';
  end if;
  select count(*) into v_recent
  from whatsapp_verification_codes
  where (user_id = v_uid or phone_e164 = p_phone_e164)
    and created_at > now() - interval '1 hour';
  if v_recent >= 3 then raise exception 'rate_limited'; end if;

  insert into whatsapp_profiles (
    user_id, phone_e164, phone_country_code, phone_last_four,
    whatsapp_opt_in_at, whatsapp_consent_version, whatsapp_sync_enabled,
    whatsapp_membership_state
  ) values (
    v_uid, p_phone_e164, p_country_code, right(p_phone_e164, 4),
    now(), p_consent_version, true, 'verification_pending'
  )
  on conflict (user_id) do update set
    phone_e164 = excluded.phone_e164,
    phone_country_code = excluded.phone_country_code,
    phone_last_four = excluded.phone_last_four,
    -- changing the number always re-verifies; keeping it keeps verification
    phone_verified_at = case
      when whatsapp_profiles.phone_e164 = excluded.phone_e164
        then whatsapp_profiles.phone_verified_at
      else null
    end,
    whatsapp_opt_in_at = now(),
    whatsapp_consent_version = excluded.whatsapp_consent_version,
    whatsapp_sync_enabled = true,
    whatsapp_membership_state = 'verification_pending',
    updated_at = now();

  -- Old codes die when the number changes or a resend happens.
  delete from whatsapp_verification_codes where user_id = v_uid;
  insert into whatsapp_verification_codes (user_id, phone_e164)
  values (v_uid, p_phone_e164);
end;
$$;

grant execute on function
  public.whatsapp_request_verification(text, text, text) to authenticated;
revoke execute on function
  public.whatsapp_request_verification(text, text, text) from public, anon;

-- Check a verification code (hash comparison; bounded attempts).
create function public.whatsapp_verify_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  rec record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_code is null or p_code !~ '^[0-9]{6}$' then return false; end if;
  select * into rec
  from whatsapp_verification_codes
  where user_id = v_uid
  order by created_at desc
  limit 1;
  if rec is null or rec.code_hash is null then return false; end if;
  if rec.expires_at < now() or rec.attempts >= 6 then
    return false;
  end if;
  update whatsapp_verification_codes
  set attempts = attempts + 1 where id = rec.id;
  if crypt(p_code, rec.code_hash) <> rec.code_hash then
    return false;
  end if;
  delete from whatsapp_verification_codes where user_id = v_uid;
  update whatsapp_profiles
  set phone_verified_at = now(),
      whatsapp_membership_state = 'queued',
      updated_at = now()
  where user_id = v_uid and phone_e164 = rec.phone_e164;
  perform whatsapp_enqueue_membership(v_uid);
  return true;
end;
$$;

grant execute on function public.whatsapp_verify_code(text) to authenticated;
revoke execute on function public.whatsapp_verify_code(text) from public, anon;

-- Disconnect: queue removal, disable sync, clear consent. The number and
-- its verification are retained so reconnecting is cheap (documented).
create function public.whatsapp_disconnect()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_wa record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_wa from whatsapp_profiles where user_id = v_uid;
  if v_wa is null then return; end if;
  if v_wa.phone_e164 is not null then
    update whatsapp_membership_jobs
    set state = 'superseded'
    where user_id = v_uid and state = 'queued';
    insert into whatsapp_membership_jobs
      (user_id, phone_e164, desired_membership, idempotency_key)
    values (
      v_uid, v_wa.phone_e164, false,
      v_uid::text || ':disconnect:'
        || floor(extract(epoch from clock_timestamp()) * 1000)::text
    );
  end if;
  update whatsapp_profiles
  set whatsapp_sync_enabled = false,
      whatsapp_opt_in_at = null,
      whatsapp_consent_version = null,
      whatsapp_membership_state = 'not_connected',
      whatsapp_membership_updated_at = now(),
      updated_at = now()
  where user_id = v_uid;
  delete from whatsapp_verification_codes where user_id = v_uid;
end;
$$;

grant execute on function public.whatsapp_disconnect() to authenticated;
revoke execute on function public.whatsapp_disconnect() from public, anon;

-- Invite link, gated: verified, opted in, ON the beach, and in a state
-- where the link is legitimate. Never exposed unauthenticated.
create function public.whatsapp_get_invite()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_wa record;
  v_on_beach boolean;
begin
  if v_uid is null then return null; end if;
  select * into v_wa from whatsapp_profiles where user_id = v_uid;
  if v_wa is null
     or v_wa.phone_verified_at is null
     or v_wa.whatsapp_opt_in_at is null
     or not v_wa.whatsapp_sync_enabled
     or v_wa.whatsapp_membership_state not in ('member', 'invite_required') then
    return null;
  end if;
  select on_beach into v_on_beach from profiles where id = v_uid;
  if not coalesce(v_on_beach, false) then return null; end if;
  return (select invite_url from whatsapp_group_config where id = 'bain_on_the_beach');
end;
$$;

grant execute on function public.whatsapp_get_invite() to authenticated;
revoke execute on function public.whatsapp_get_invite() from public, anon;

-- Admin status snapshot (sanitized: no member phone numbers).
create function public.whatsapp_admin_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg record;
  v_queued integer;
  v_failed integer;
begin
  if not whatsapp_is_admin() then raise exception 'forbidden'; end if;
  select * into cfg from whatsapp_group_config where id = 'bain_on_the_beach';
  select count(*) into v_queued from whatsapp_membership_jobs where state = 'queued';
  select count(*) into v_failed from whatsapp_membership_jobs where state = 'failed';
  return jsonb_build_object(
    'connectionState', cfg.connection_state,
    'connectedAccountName', cfg.connected_account_name,
    'lastConnectedAt', cfg.last_connected_at,
    'groupLinked', cfg.group_jid is not null,
    'memberCount', cfg.member_count,
    'lastReconciledAt', cfg.last_reconciled_at,
    'pendingJobs', v_queued,
    'failedJobs', v_failed,
    'qr', case
      when cfg.qr_data is not null and cfg.qr_expires_at > now()
        then cfg.qr_data
      else null
    end
  );
end;
$$;

grant execute on function public.whatsapp_admin_status() to authenticated;
revoke execute on function public.whatsapp_admin_status() from public, anon;

create function public.whatsapp_admin_command(p_command text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not whatsapp_is_admin() then raise exception 'forbidden'; end if;
  insert into whatsapp_admin_commands (command, requested_by)
  values (p_command, auth.uid());
end;
$$;

grant execute on function public.whatsapp_admin_command(text) to authenticated;
revoke execute on function public.whatsapp_admin_command(text) from public, anon;

-- Account deletion safety: removal outlives the profile row. The membership
-- job has no FK to profiles, and this trigger records the removal before
-- the cascade deletes the phone data.
create function public.whatsapp_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.phone_e164 is not null then
    insert into whatsapp_membership_jobs
      (user_id, phone_e164, desired_membership, idempotency_key)
    values (
      old.user_id, old.phone_e164, false,
      old.user_id::text || ':deleted:'
        || floor(extract(epoch from clock_timestamp()) * 1000)::text
    );
  end if;
  return old;
end;
$$;

create trigger wa_profiles_on_delete
  before delete on public.whatsapp_profiles
  for each row execute function public.whatsapp_on_profile_delete();
