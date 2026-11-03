create or replace function public.rental_vehicle_match_candidates(input_name text)
returns table(vehicle_id uuid, match_score integer)
language plpgsql
stable
as $$
declare
  normalized_name text := public.normalize_vehicle_match_text(input_name);
  found_year integer;
begin
  if normalized_name = '' then return; end if;
  found_year := substring(normalized_name from '(19[0-9]{2}|20[0-9]{2})')::integer;

  return query
  with scored as (
    select c.id,
      greatest(
        case when length(public.normalize_vehicle_match_text(c.car_ref)) >= 4
          and strpos(normalized_name, public.normalize_vehicle_match_text(c.car_ref)) > 0 then 120 else 0 end,
        case when length(public.normalize_vehicle_match_text(c.license_plate)) >= 4
          and strpos(normalized_name, public.normalize_vehicle_match_text(c.license_plate)) > 0 then 120 else 0 end,
        case when found_year is not null and c.model_year = found_year
          and strpos(normalized_name, public.normalize_vehicle_match_text(c.model)) > 0 then 100 else 0 end,
        case when public.normalize_vehicle_match_text(c.model) <> ''
          and normalized_name = public.normalize_vehicle_match_text(c.model)
          and (found_year is null or c.model_year is null or c.model_year in (found_year, found_year + 543)) then 80 else 0 end,
        case when length(public.normalize_vehicle_match_text(c.model)) >= 4
          and strpos(normalized_name, public.normalize_vehicle_match_text(c.model)) > 0
          and (found_year is null or c.model_year is null or c.model_year in (found_year, found_year + 543)) then 60 else 0 end
      ) as score
    from public.rental_cars c
    where c.active is true and c.status not in ('ซ่อม', 'งดใช้งาน')
  ), best as (
    select id, score from scored
    where score > 0 and score = (select max(score) from scored)
  )
  select best.id, best.score
  from best join public.rental_cars c on c.id = best.id
  order by best.score desc, c.car_ref, best.id;
end;
$$;

create or replace function public.try_auto_pair_rental_booking(booking_id uuid)
returns boolean
language plpgsql
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
