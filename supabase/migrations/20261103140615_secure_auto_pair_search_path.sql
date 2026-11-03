alter function public.normalize_vehicle_match_text(text) set search_path = pg_catalog;
alter function public.match_rental_booking_vehicle(text) set search_path = pg_catalog;
alter function public.try_auto_pair_rental_booking(uuid) set search_path = pg_catalog;
alter function public.auto_pair_rental_booking_after_write() set search_path = pg_catalog;
alter function public.auto_pair_rental_bookings_after_vehicle_insert() set search_path = pg_catalog;
alter function public.rental_vehicle_match_candidates(text) set search_path = pg_catalog;
