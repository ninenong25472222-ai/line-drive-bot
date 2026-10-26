-- Keeps booking records for monthly reporting while a Drive file awaits review.
alter table public.rental_bookings
  add column if not exists deletion_status text not null default 'active',
  add column if not exists pending_deletion_at timestamptz,
  add column if not exists original_drive_parent_ids text;

alter table public.rental_bookings
  drop constraint if exists rental_bookings_deletion_status_check;

alter table public.rental_bookings
  add constraint rental_bookings_deletion_status_check
  check (deletion_status in ('active', 'pending_confirmation', 'deleted', 'restored'));

create index if not exists rental_bookings_pending_deletion_idx
  on public.rental_bookings (deletion_status, return_date);

-- Customer and booking data is served only through the authenticated Netlify
-- functions. Do not expose this table through the public Data API.
drop policy if exists "public read rental bookings" on public.rental_bookings;
revoke all on public.rental_bookings from anon, authenticated;
