alter table public.rental_bookings
  add column if not exists tax_company_name text,
  add column if not exists withhold_tax_5 boolean not null default false;
