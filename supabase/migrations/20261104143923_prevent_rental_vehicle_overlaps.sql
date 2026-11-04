create or replace function public.prevent_rental_vehicle_overlap()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.car_id is null
    or new.duplicate_of is not null
    or new.deletion_status not in ('active', 'restored')
    or new.status in ('ยกเลิก', 'ผิดพลาด')
    or new.pickup_on is null
    or new.return_on is null
    or new.pickup_on > new.return_on then
    return new;
  end if;

  -- Serialize assignments for this vehicle so concurrent saves cannot both
  -- pass the overlap check before either booking becomes visible.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.car_id::text, 0)
  );

  if exists (
    select 1
    from public.rental_bookings other
    where other.car_id = new.car_id
      and other.id <> new.id
      and other.duplicate_of is null
      and other.deletion_status in ('active', 'restored')
      and other.status not in ('ยกเลิก', 'ผิดพลาด')
      and other.pickup_on is not null
      and other.return_on is not null
      and other.pickup_on <= new.return_on
      and new.pickup_on <= other.return_on
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
    raise exception using
      errcode = '23P01',
      message = 'CAR_BOOKING_CONFLICT';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_rental_vehicle_overlap() from public, anon, authenticated;
grant execute on function public.prevent_rental_vehicle_overlap() to service_role;

drop trigger if exists rental_bookings_prevent_vehicle_overlap on public.rental_bookings;
create trigger rental_bookings_prevent_vehicle_overlap
before insert or update of car_id, car, pickup_date, pickup_on, pickup_time, return_date, return_on, return_time, status, deletion_status, duplicate_of
on public.rental_bookings
for each row execute function public.prevent_rental_vehicle_overlap();

create or replace function public.try_auto_pair_rental_booking(booking_id uuid)
returns boolean
language plpgsql
set search_path = pg_catalog
as $$
declare
  booking_row public.rental_bookings%rowtype;
  candidate record;
  has_complete_times boolean;
  has_conflict boolean;
begin
  select * into booking_row from public.rental_bookings where id = booking_id;
  if not found
    or booking_row.car_id is not null
    or booking_row.duplicate_of is not null
    or booking_row.deletion_status not in ('active', 'restored')
    or booking_row.status in ('ยกเลิก', 'ผิดพลาด')
    or booking_row.pickup_on is null
    or booking_row.return_on is null
    or booking_row.pickup_on > booking_row.return_on then
    return false;
  end if;

  has_complete_times := booking_row.pickup_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and booking_row.return_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';

  for candidate in
    select * from public.rental_vehicle_match_candidates(booking_row.car)
    order by match_score desc, vehicle_id
  loop
    -- The BEFORE trigger uses the same lock for manual and automatic pairing.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(candidate.vehicle_id::text, 0)
    );

    select exists (
      select 1
      from public.rental_bookings other
      where other.car_id = candidate.vehicle_id
        and other.id <> booking_row.id
        and other.duplicate_of is null
        and other.deletion_status in ('active', 'restored')
        and other.status not in ('ยกเลิก', 'ผิดพลาด')
        and other.pickup_on is not null and other.return_on is not null
        and other.pickup_on <= booking_row.return_on
        and booking_row.pickup_on <= other.return_on
        and case
          when has_complete_times
            and other.pickup_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            and other.return_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          then (booking_row.pickup_on + booking_row.pickup_time::time) < (other.return_on + other.return_time::time)
            and (booking_row.return_on + booking_row.return_time::time) > (other.pickup_on + other.pickup_time::time)
          else true
        end
    ) into has_conflict;

    if not has_conflict then
      update public.rental_bookings
      set car_id = candidate.vehicle_id, updated_at = now()
      where id = booking_row.id and car_id is null;
      if found then return true; end if;
      return false;
    end if;
  end loop;

  return false;
end;
$$;
