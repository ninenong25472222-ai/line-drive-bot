create or replace function public.auto_pair_rental_booking_after_write()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.car_id is null and new.duplicate_of is null and (
    tg_op = 'INSERT'
    or (old.car_id is null and old.duplicate_of is null and (
      old.car is distinct from new.car
      or old.pickup_date is distinct from new.pickup_date
      or old.pickup_on is distinct from new.pickup_on
      or old.pickup_time is distinct from new.pickup_time
      or old.return_date is distinct from new.return_date
      or old.return_on is distinct from new.return_on
      or old.return_time is distinct from new.return_time
      or old.status is distinct from new.status
      or old.deletion_status is distinct from new.deletion_status
    ))
  ) then
    perform public.try_auto_pair_rental_booking(new.id);
  end if;
  return new;
end;
$$;
