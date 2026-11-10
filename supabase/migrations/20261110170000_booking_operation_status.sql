alter table public.rental_bookings
  add column rental_status text not null default 'scheduled',
  add column rental_status_history jsonb not null default '[]'::jsonb,
  add column delivered_at timestamptz,
  add column returned_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancellation_reason text,
  add column status_before_cancel text;

alter table public.rental_bookings
  add constraint rental_bookings_rental_status_check
  check (rental_status = any (array['scheduled', 'delivered', 'returned', 'cancelled']));

update public.rental_bookings
set rental_status = 'cancelled',
    cancelled_at = coalesce(updated_at, created_at),
    cancellation_reason = 'รายการเดิมมีสถานะยกเลิก',
    status_before_cancel = 'ยืนยันแล้ว',
    rental_status_history = jsonb_build_array(jsonb_build_object(
      'from', 'scheduled',
      'to', 'cancelled',
      'at', coalesce(updated_at, created_at),
      'reason', 'รายการเดิมมีสถานะยกเลิก'
    ))
where status = 'ยกเลิก';
