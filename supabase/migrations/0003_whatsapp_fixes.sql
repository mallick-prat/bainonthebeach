-- Clean error when connecting WhatsApp before the profile exists (the FK
-- would otherwise surface as a raw 23503).

create or replace function public.whatsapp_request_verification(
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
  if not exists (select 1 from profiles where id = v_uid) then
    raise exception 'no_profile';
  end if;
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

  delete from whatsapp_verification_codes where user_id = v_uid;
  insert into whatsapp_verification_codes (user_id, phone_e164)
  values (v_uid, p_phone_e164);
end;
$$;
