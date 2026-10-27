-- Car availability is intentionally visible in the public booking screen.
-- No insert, update, or delete access is granted to anonymous clients.
grant select on table public.rental_cars to anon;

create policy "dashboard can read active car catalogue"
  on public.rental_cars
  for select
  to anon
  using (true);
