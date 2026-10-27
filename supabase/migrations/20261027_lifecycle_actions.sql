alter table public.rental_bookings
  drop constraint if exists rental_bookings_deletion_status_check;

alter table public.rental_bookings
  add constraint rental_bookings_deletion_status_check
  check (deletion_status in ('active', 'pending_move', 'pending_confirmation', 'restore_requested', 'pending_permanent_delete', 'deleted', 'restored', 'move_failed'));
