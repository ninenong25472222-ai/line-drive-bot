create or replace function public.normalize_vehicle_match_text(input_text text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(lower(coalesce(input_text, '')), '[^[:alnum:]]', '', 'g');
$$;

create or replace function public.match_rental_booking_vehicle(input_name text)
returns uuid
language plpgsql
stable
as $$
declare
  normalized_name text := public.normalize_vehicle_match_text(input_name);
  matched_id uuid;
  match_count integer;
begin
  if normalized_name = '' then return null; end if;

  with scored as (
    select c.id,
      greatest(
        case when length(public.normalize_vehicle_match_text(c.car_ref)) >= 4
          and strpos(normalized_name, public.normalize_vehicle_match_text(c.car_ref)) > 0 then 100 else 0 end,
        case when length(public.normalize_vehicle_match_text(c.license_plate)) >= 4
          and strpos(normalized_name, public.normalize_vehicle_match_text(c.license_plate)) > 0 then 100 else 0 end,
        case when public.normalize_vehicle_match_text(c.model) <> ''
          and normalized_name = public.normalize_vehicle_match_text(c.model) then 80 else 0 end,
        case when length(public.normalize_vehicle_match_text(c.model)) >= 4
          and strpos(normalized_name, public.normalize_vehicle_match_text(c.model)) > 0 then 60 else 0 end
      ) as score
    from public.rental_cars c
    where c.active is true and c.status not in ('ซ่อม', 'งดใช้งาน')
  ), best as (
    select id from scored where score = (select max(score) from scored) and score > 0
  )
  select min(id::text)::uuid, count(*)::integer into matched_id, match_count from best;

  if match_count <> 1 then return null; end if;
  return matched_id;
end;
$$;

create or replace function public.try_auto_pair_rental_booking(booking_id uuid)
returns boolean
language plpgsql
as $$
declare
  booking_row public.rental_bookings%rowtype;
  vehicle_id uuid;
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

  vehicle_id := public.match_rental_booking_vehicle(booking_row.car);
  if vehicle_id is null then return false; end if;

  has_complete_times := booking_row.pickup_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and booking_row.return_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';

  select exists (
    select 1
    from public.rental_bookings other
    where other.car_id = vehicle_id
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

  if has_conflict then return false; end if;

  update public.rental_bookings
  set car_id = vehicle_id, updated_at = now()
  where id = booking_row.id and car_id is null;
  return found;
end;
$$;

create or replace function public.auto_pair_rental_booking_after_write()
returns trigger
language plpgsql
as $$
begin
  if new.car_id is null and new.duplicate_of is null and (
    tg_op = 'INSERT'
    or (old.car_id is null and old.duplicate_of is null and (
      old.car is distinct from new.car
      or old.pickup_on is distinct from new.pickup_on
      or old.return_on is distinct from new.return_on
      or old.pickup_time is distinct from new.pickup_time
      or old.return_time is distinct from new.return_time
    ))
  ) then
    perform public.try_auto_pair_rental_booking(new.id);
  end if;
  return new;
end;
$$;

create or replace function public.auto_pair_rental_bookings_after_vehicle_insert()
returns trigger
language plpgsql
as $$
declare
  pending record;
begin
  for pending in
    select id
    from public.rental_bookings
    where car_id is null and duplicate_of is null
      and deletion_status in ('active', 'restored')
      and status not in ('ยกเลิก', 'ผิดพลาด')
    order by pickup_on nulls last, pickup_time nulls last, created_at
  loop
    perform public.try_auto_pair_rental_booking(pending.id);
  end loop;
  return new;
end;
$$;

drop trigger if exists rental_bookings_auto_pair_vehicle on public.rental_bookings;
create trigger rental_bookings_auto_pair_vehicle
after insert or update of car, pickup_on, return_on, pickup_time, return_time
on public.rental_bookings
for each row execute function public.auto_pair_rental_booking_after_write();

drop trigger if exists rental_cars_auto_pair_bookings on public.rental_cars;
create trigger rental_cars_auto_pair_bookings
after insert on public.rental_cars
for each row execute function public.auto_pair_rental_bookings_after_vehicle_insert();

do $$
declare
  pending record;
begin
  for pending in
    select id
    from public.rental_bookings
    where car_id is null and duplicate_of is null
      and deletion_status in ('active', 'restored')
      and status not in ('ยกเลิก', 'ผิดพลาด')
    order by pickup_on nulls last, pickup_time nulls last, created_at
  loop
    perform public.try_auto_pair_rental_booking(pending.id);
  end loop;
end;
$$;
