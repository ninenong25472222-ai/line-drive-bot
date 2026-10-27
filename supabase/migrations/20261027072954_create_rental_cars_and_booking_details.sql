-- Cars are managed through protected Netlify functions. Keep this table out of
-- the public Data API; the dashboard only receives the safe display fields it needs.
create table if not exists public.rental_cars (
  id uuid primary key default gen_random_uuid(),
  car_ref text not null unique,
  model text not null,
  license_plate text,
  color text,
  model_year integer,
  default_daily_rate numeric(12,2) not null default 0 check (default_daily_rate >= 0),
  default_security_deposit numeric(12,2) not null default 0 check (default_security_deposit >= 0),
  status text not null default 'ว่าง' check (status in ('ว่าง', 'จองแล้ว', 'กำลังใช้งาน', 'ซ่อม', 'งดใช้งาน')),
  image_url text,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rental_cars enable row level security;
revoke all on table public.rental_cars from anon, authenticated;

alter table public.rental_bookings
  add column if not exists car_id uuid references public.rental_cars(id) on delete set null,
  add column if not exists booking_channel text,
  add column if not exists daily_rate numeric(12,2),
  add column if not exists booking_deposit numeric(12,2),
  add column if not exists security_deposit numeric(12,2),
  add column if not exists delivery_fee numeric(12,2),
  add column if not exists service_total numeric(12,2),
  add column if not exists booking_note text,
  add column if not exists wants_tax_invoice boolean not null default false;

create index if not exists rental_cars_active_status_idx
  on public.rental_cars (active, status, model);

create index if not exists rental_bookings_car_schedule_idx
  on public.rental_bookings (car_id, pickup_date, return_date)
  where deletion_status in ('active', 'restored');
