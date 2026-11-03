revoke all on function public.normalize_vehicle_match_text(text) from public, anon, authenticated;
revoke all on function public.match_rental_booking_vehicle(text) from public, anon, authenticated;
revoke all on function public.rental_vehicle_match_candidates(text) from public, anon, authenticated;
revoke all on function public.try_auto_pair_rental_booking(uuid) from public, anon, authenticated;
revoke all on function public.auto_pair_rental_booking_after_write() from public, anon, authenticated;
revoke all on function public.auto_pair_rental_bookings_after_vehicle_insert() from public, anon, authenticated;

grant execute on function public.normalize_vehicle_match_text(text) to service_role;
grant execute on function public.match_rental_booking_vehicle(text) to service_role;
grant execute on function public.rental_vehicle_match_candidates(text) to service_role;
grant execute on function public.try_auto_pair_rental_booking(uuid) to service_role;
