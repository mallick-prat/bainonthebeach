-- Phone-based admin access plus people-management RPCs for /admin/whatsapp.
-- A user whose VERIFIED WhatsApp number is in whatsapp_admin_phones gets
-- admin rights, in addition to the email allowlist in whatsapp_admins.

create table public.whatsapp_admin_phones (
  phone_e164 text primary key
);

alter table public.whatsapp_admin_phones enable row level security;
revoke all on public.whatsapp_admin_phones from anon, authenticated;

insert into public.whatsapp_admin_phones (phone_e164) values
  ('+14694498399'),
  ('+17813668806');

create or replace function public.whatsapp_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.whatsapp_admins a
      join auth.users u on lower(u.email) = lower(a.email)
      where u.id = auth.uid()
    )
    or exists (
      select 1
      from public.whatsapp_profiles wp
      join public.whatsapp_admin_phones ap on ap.phone_e164 = wp.phone_e164
      where wp.user_id = auth.uid()
        and wp.phone_verified_at is not null
    );
$$;

/* ------------------------- people management ---------------------- */

create function public.admin_list_people()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not whatsapp_is_admin() then raise exception 'forbidden'; end if;
  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'userId', p.id,
          'displayName', p.display_name,
          'onBeach', p.on_beach,
          'phoneLastFour', wp.phone_last_four,
          'phoneVerified', wp.phone_verified_at is not null,
          'membershipState', wp.whatsapp_membership_state,
          'isAnonymous', u.is_anonymous,
          'createdAt', p.created_at
        )
        order by p.created_at desc
      )
      from profiles p
      join auth.users u on u.id = p.id
      left join whatsapp_profiles wp on wp.user_id = p.id
    ),
    '[]'::jsonb
  );
end;
$$;

grant execute on function public.admin_list_people() to authenticated;
revoke execute on function public.admin_list_people() from public, anon;

-- Full delete: auth user cascades to profile and whatsapp profile; the
-- delete trigger records the group-removal job first.
create function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not whatsapp_is_admin() then raise exception 'forbidden'; end if;
  if p_user_id = auth.uid() then raise exception 'not_yourself'; end if;
  delete from auth.users where id = p_user_id;
end;
$$;

grant execute on function public.admin_delete_user(uuid) to authenticated;
revoke execute on function public.admin_delete_user(uuid) from public, anon;

create function public.admin_set_beach(p_user_id uuid, p_on_beach boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not whatsapp_is_admin() then raise exception 'forbidden'; end if;
  update profiles
  set on_beach = p_on_beach,
      on_beach_since = case when p_on_beach then now() else null end
  where id = p_user_id;
  if not found then raise exception 'no_profile'; end if;
  perform whatsapp_enqueue_membership(p_user_id);
end;
$$;

grant execute on function public.admin_set_beach(uuid, boolean) to authenticated;
revoke execute on function public.admin_set_beach(uuid, boolean) from public, anon;

create function public.admin_disconnect_whatsapp(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wa record;
begin
  if not whatsapp_is_admin() then raise exception 'forbidden'; end if;
  select * into v_wa from whatsapp_profiles where user_id = p_user_id;
  if v_wa is null then return; end if;
  if v_wa.phone_e164 is not null then
    update whatsapp_membership_jobs
    set state = 'superseded'
    where user_id = p_user_id and state = 'queued';
    insert into whatsapp_membership_jobs
      (user_id, phone_e164, desired_membership, idempotency_key)
    values (
      p_user_id, v_wa.phone_e164, false,
      p_user_id::text || ':admin-disconnect:'
        || floor(extract(epoch from clock_timestamp()) * 1000)::text
    );
  end if;
  delete from whatsapp_profiles where user_id = p_user_id;
  delete from whatsapp_verification_codes where user_id = p_user_id;
end;
$$;

grant execute on function public.admin_disconnect_whatsapp(uuid) to authenticated;
revoke execute on function public.admin_disconnect_whatsapp(uuid) from public, anon;
