alter table public.rental_bookings
  add column if not exists allow_vehicle_overlap boolean not null default false,
  add column if not exists late_free_minutes integer not null default 0;

create table if not exists public.rental_settings (
  setting_key text primary key,
  setting_value text not null,
  updated_at timestamptz not null default now()
);

alter table public.rental_settings enable row level security;
revoke all on table public.rental_settings from anon, authenticated;
grant all on table public.rental_settings to service_role;

insert into public.rental_settings (setting_key, setting_value)
values ('late_return_grace_minutes', '60')
on conflict (setting_key) do nothing;

create or replace function public.prevent_rental_vehicle_overlap()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  -- A manager explicitly confirmed this overlap in the dashboard.
  if new.allow_vehicle_overlap then
    return new;
  end if;

  if new.car_id is null
    or new.duplicate_of is not null
    or new.deletion_status not in ('active', 'restored')
    or new.status in ('ยกเลิก', 'ผิดพลาด')
    or new.pickup_on is null
    or new.return_on is null
    or new.pickup_on > new.return_on then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.car_id::text, 0));

  if exists (
    select 1 from public.rental_bookings other
    where other.car_id = new.car_id
      and other.id <> new.id
      and other.duplicate_of is null
      and other.deletion_status in ('active', 'restored')
      and other.status not in ('ยกเลิก', 'ผิดพลาด')
      and other.pickup_on is not null and other.return_on is not null
      and other.pickup_on <= new.return_on and new.pickup_on <= other.return_on
      and case
        when new.pickup_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          and new.return_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          and other.pickup_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          and other.return_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        then (new.pickup_on + new.pickup_time::time) < (other.return_on + other.return_time::time)
          and (new.return_on + new.return_time::time) > (other.pickup_on + other.pickup_time::time)
        else true
      end
  ) then
    raise exception using errcode = '23P01', message = 'CAR_BOOKING_CONFLICT';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_rental_vehicle_overlap() from public, anon, authenticated;
grant execute on function public.prevent_rental_vehicle_overlap() to service_role;

drop trigger if exists rental_bookings_prevent_vehicle_overlap on public.rental_bookings;
create trigger rental_bookings_prevent_vehicle_overlap
before insert or update of car_id, car, pickup_date, pickup_on, pickup_time, return_date, return_on, return_time, status, deletion_status, duplicate_of, allow_vehicle_overlap
on public.rental_bookings
for each row execute function public.prevent_rental_vehicle_overlap();
