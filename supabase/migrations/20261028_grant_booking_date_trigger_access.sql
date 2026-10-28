-- The booking write service has access only to the trigger's narrowly scoped
-- date parser.  Keep the trigger as SECURITY INVOKER so booking writes do not
-- acquire broader database privileges.
grant usage on schema private to service_role;
grant execute on function private.booking_date(text) to service_role;
grant execute on function private.sync_rental_booking_dates() to service_role;

alter function private.sync_rental_booking_dates() security invoker;
