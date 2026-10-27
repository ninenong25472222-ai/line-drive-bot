create table if not exists public.rental_booking_options (
  id uuid primary key default gen_random_uuid(),
  option_type text not null check (option_type in ('channel', 'location')),
  label text not null check (char_length(trim(label)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (option_type, label)
);

alter table public.rental_booking_options enable row level security;
revoke all on table public.rental_booking_options from anon, authenticated;
grant select on table public.rental_booking_options to anon;

drop policy if exists "dashboard can read booking option catalogue" on public.rental_booking_options;
create policy "dashboard can read booking option catalogue"
  on public.rental_booking_options for select to anon using (true);

insert into public.rental_booking_options (option_type, label) values
  ('channel', 'LINE OA'), ('channel', 'LINE'), ('channel', 'Facebook'), ('channel', 'โทรศัพท์'),
  ('channel', 'Walk-in'), ('channel', 'Partner / Agent'), ('channel', 'Direct / Dashboard'),
  ('location', 'สนามบินสุราษฎร์ธานี'), ('location', 'ตัวเมืองสุราษฎร์ธานี'),
  ('location', 'ท่าเรือดอนสัก'), ('location', 'สนามบินนครศรีธรรมราช'),
  ('location', 'โรงแรมในสุราษฎร์ธานี')
on conflict (option_type, label) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('car-photos', 'car-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
