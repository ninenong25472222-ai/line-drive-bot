-- The date-normalisation trigger runs whenever a booking is inserted or
-- updated.  The caller is the service role used by the Edge Function, which
-- deliberately has no direct access to the private schema.  Run this tiny,
-- fixed trigger as its owning role instead, so ordinary booking saves do not
-- fail while the private parser remains inaccessible to application users.
create or replace function private.sync_rental_booking_dates()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  new.pickup_on := private.booking_date(new.pickup_date);
  new.return_on := private.booking_date(new.return_date);
  return new;
end;
$$;

revoke all on function private.sync_rental_booking_dates() from public;
