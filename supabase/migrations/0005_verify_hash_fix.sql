-- Fix verification hashing: pgcrypto's crypt() does not understand the
-- "$2b$" prefix bcryptjs emits, so no code could ever verify. Switch to
-- SHA-256 keyed with the user id (6-digit codes are attempt-capped at 6,
-- so bcrypt cost adds nothing here). Legacy "$2b$" rows still verify via
-- a prefix swap ($2a$/$2b$ digests are identical for short ASCII input).

create or replace function public.whatsapp_verify_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  rec record;
  v_sha text;
  v_legacy text;
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

  v_sha := encode(digest(p_code || rec.user_id::text, 'sha256'), 'hex');
  if rec.code_hash like '$2%' then
    v_legacy := replace(rec.code_hash, '$2b$', '$2a$');
    if crypt(p_code, v_legacy) <> v_legacy then return false; end if;
  elsif v_sha <> rec.code_hash then
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
