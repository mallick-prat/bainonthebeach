-- Bain on the Beach: profiles table, RLS, atomic status function, realtime.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  character_config jsonb not null,
  character_schema_version integer not null default 1,
  on_beach boolean not null default false,
  on_beach_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint display_name_length check (
    char_length(display_name) between 1 and 64
    and btrim(display_name) <> ''
  ),
  constraint schema_version_positive check (character_schema_version > 0),
  -- on_beach_since is non-null exactly when on_beach is true.
  constraint on_beach_since_consistent check (
    (on_beach and on_beach_since is not null)
    or (not on_beach and on_beach_since is null)
  )
);

comment on table public.profiles is
  'Shared beach profiles. Never store emails, tokens, IPs, or coordinates here.';

create index profiles_on_beach_idx on public.profiles (on_beach)
  where on_beach = true;
create index profiles_display_name_idx on public.profiles (lower(display_name));

-- updated_at maintenance.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Row Level Security ---------------------------------------------------------
alter table public.profiles enable row level security;

-- Any authenticated user may read the shared island data. The table holds
-- only public-safe columns by design (no emails, no auth metadata).
create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (true);

create policy profiles_insert_own
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No delete policy: deletion happens through the documented admin path.

-- Column-level hardening: clients cannot touch immutable ids,
-- server-maintained timestamps, or the status pair directly. Status changes
-- go through set_beach_status() so the pair stays atomic and consistent.
revoke insert, update on public.profiles from authenticated;
grant insert (id, display_name, character_config, character_schema_version)
  on public.profiles to authenticated;
grant update (display_name, character_config, character_schema_version)
  on public.profiles to authenticated;

-- Atomic status change -------------------------------------------------------
create function public.set_beach_status(p_on_beach boolean)
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
end;
$$;

revoke execute on function public.set_beach_status(boolean) from public, anon;
grant execute on function public.set_beach_status(boolean) to authenticated;

-- Realtime -------------------------------------------------------------------
alter publication supabase_realtime add table public.profiles;
