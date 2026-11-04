drop trigger if exists rental_bookings_auto_pair_vehicle on public.rental_bookings;
create trigger rental_bookings_auto_pair_vehicle
after insert or update of car, pickup_date, pickup_on, pickup_time, return_date, return_on, return_time, status, deletion_status, duplicate_of
on public.rental_bookings
for each row execute function public.auto_pair_rental_booking_after_write();

drop trigger if exists rental_cars_auto_pair_bookings on public.rental_cars;
create trigger rental_cars_auto_pair_bookings
after insert or update of car_ref, model, license_plate, model_year, active, status
on public.rental_cars
for each row execute function public.auto_pair_rental_bookings_after_vehicle_insert();
