-- LOCAL DEVELOPMENT SEED ONLY. Never run against production.
-- Creates confirmed test auth users plus beach profiles so the island is
-- populated on first boot of `supabase start` + `supabase db reset`.

do $$
declare
  names text[] := array['Priya', 'Casey', 'Jordan', 'Sam O.', 'Devon', 'Riley', 'Jordan', 'Avery'];
  uid uuid;
  i int;
begin
  for i in 1..array_length(names, 1) loop
    uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      'seed-user-' || i || '@example.com', crypt('seed-only-password', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
    );
    insert into public.profiles (
      id, display_name, character_config,
      character_schema_version, on_beach, on_beach_since
    ) values (
      uid, names[i],
      jsonb_build_object(
        'skin', (i * 7) % 6,
        'hairStyle', (array['short','spiky','bob','long','bun','none'])[1 + (i % 6)],
        'hairColor', (i * 3) % 6,
        'topStyle', (array['tee','tank','buttonup'])[1 + (i % 3)],
        'topColor', (i * 5) % 8,
        'bottomStyle', (array['shorts','pants','trunks'])[1 + (i % 3)],
        'bottomColor', (i * 11) % 8,
        'shoes', (array['sandals','sneakers','barefoot'])[1 + (i % 3)],
        'accessory', (array['none','visor','strawhat','sunglasses','snorkel','tie','floatring'])[1 + (i % 7)],
        'prop', (array['none','laptop','drink','surfboard','tote','beachball','towel'])[1 + (i % 7)]
      ),
      1, i <= 6, case when i <= 6 then now() - (i || ' hours')::interval end
    );
  end loop;
end $$;
