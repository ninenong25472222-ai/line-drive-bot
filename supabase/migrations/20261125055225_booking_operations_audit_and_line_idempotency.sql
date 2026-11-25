-- Durable LINE event receipts prevent webhook retries from creating duplicate
-- Drive files or booking rows. Only the server-side service role may use them.
create table if not exists public.line_event_receipts (
  event_id text primary key,
  message_id text,
  file_name text,
  state text not null default 'processing' check (state in ('processing', 'processed', 'failed')),
  attempts integer not null default 1,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.line_event_receipts enable row level security;
revoke all on public.line_event_receipts from anon, authenticated;
grant all on public.line_event_receipts to service_role;

create or replace function public.claim_line_event(p_event_id text, p_message_id text, p_file_name text)
returns boolean language plpgsql set search_path = pg_catalog, public as $$
declare claimed boolean := false;
begin
  insert into public.line_event_receipts(event_id, message_id, file_name, state)
  values (left(p_event_id, 200), left(coalesce(p_message_id, ''), 200), left(coalesce(p_file_name, ''), 255), 'processing')
  on conflict (event_id) do update set
    message_id = excluded.message_id,
    file_name = excluded.file_name,
    state = 'processing',
    attempts = public.line_event_receipts.attempts + 1,
    last_error = null,
    updated_at = now()
  where public.line_event_receipts.state = 'failed'
     or (public.line_event_receipts.state = 'processing' and public.line_event_receipts.updated_at < now() - interval '10 minutes')
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;
revoke all on function public.claim_line_event(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_line_event(text, text, text) to service_role;

alter table public.rental_bookings
  add column if not exists sync_status jsonb not null default '{}'::jsonb,
  add column if not exists ocr_review_status text not null default 'pending',
  add column if not exists ocr_reviewed_at timestamptz,
  add column if not exists ocr_reviewed_fields jsonb not null default '[]'::jsonb,
  add column if not exists change_history jsonb not null default '[]'::jsonb;
alter table public.rental_bookings drop constraint if exists rental_bookings_ocr_review_status_check;
alter table public.rental_bookings add constraint rental_bookings_ocr_review_status_check
  check (ocr_review_status in ('pending', 'confirmed', 'not_applicable'));

-- Append a compact immutable audit trail for operationally important edits.
create or replace function private.audit_rental_booking_changes()
returns trigger language plpgsql set search_path = pg_catalog, private as $$
declare changes jsonb := '{}'::jsonb; history jsonb; field_name text; old_value jsonb; new_value jsonb;
begin
  foreach field_name in array array[
    'customer_name','customer_phone','booking_no','car','car_id',
    'pickup_date','pickup_time','return_date','return_time',
    'daily_rate','service_total','delivery_fee','booking_deposit','security_deposit',
    'wants_tax_invoice','withhold_tax_5','rental_status','rental_status_history',
    'status','deletion_status','trash_reason','ocr_review_status','ocr_reviewed_fields'
  ] loop
    old_value := to_jsonb(old) -> field_name;
    new_value := to_jsonb(new) -> field_name;
    if old_value is distinct from new_value then
      changes := changes || jsonb_build_object(field_name, jsonb_build_object('from', old_value, 'to', new_value));
    end if;
  end loop;
  if changes <> '{}'::jsonb then
    history := coalesce(old.change_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now(), 'actor', 'ผู้ดูแล/ระบบ (ไม่แยกผู้ใช้)', 'changes', changes));
    select coalesce(jsonb_agg(recent.item order by recent.ordinal), '[]'::jsonb) into new.change_history
    from (select value as item, ordinality as ordinal from jsonb_array_elements(history) with ordinality order by ordinality desc limit 100) as recent;
  end if;
  return new;
end;
$$;
revoke all on function private.audit_rental_booking_changes() from public;
drop trigger if exists rental_bookings_change_audit on public.rental_bookings;
create trigger rental_bookings_change_audit before update on public.rental_bookings
for each row execute function private.audit_rental_booking_changes();

-- Durable retry queue. Payloads contain only operational booking/file references
-- needed by the worker; dashboard users can request retry, but cannot read rows.
create table if not exists public.rental_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.rental_bookings(id) on delete set null,
  event_id text,
  target text not null check (target in ('supabase', 'google_sheets', 'appsheet')),
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  state text not null default 'queued' check (state in ('queued', 'processing', 'succeeded', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists rental_sync_jobs_retry_idx on public.rental_sync_jobs(state, next_attempt_at) where state in ('queued','failed');
alter table public.rental_sync_jobs enable row level security;
revoke all on public.rental_sync_jobs from anon, authenticated;
grant all on public.rental_sync_jobs to service_role;

-- Fleet details (especially registration plates, notes, and rates) are now
-- read through the admin-authorized Edge Function instead of the public API.
revoke select on table public.rental_cars from anon;
drop policy if exists "dashboard can read active car catalogue" on public.rental_cars;
