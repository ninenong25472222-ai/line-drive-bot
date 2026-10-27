-- Keep source text intact while storing safe, normalized dates for scheduling.
create schema if not exists private;

create or replace function private.booking_date(value text)
returns date
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  source text := btrim(coalesce(value, ''));
  parts text[];
  day_number integer;
  month_number integer;
  year_number integer;
begin
  if source = '' then return null; end if;

  if source ~ '^[0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}$' then
    parts := regexp_match(source, '^([0-9]{4})[-/.]([0-9]{1,2})[-/.]([0-9]{1,2})$');
    return make_date(parts[1]::integer, parts[2]::integer, parts[3]::integer);
  end if;

  if source ~ '^[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{4}$' then
    parts := regexp_match(source, '^([0-9]{1,2})[-/.]([0-9]{1,2})[-/.]([0-9]{4})$');
    year_number := parts[3]::integer;
    if year_number > 2400 then year_number := year_number - 543; end if;
    return make_date(year_number, parts[2]::integer, parts[1]::integer);
  end if;

  parts := regexp_match(replace(source, ' ', ''), '^([0-9]{1,2})(ม\\.ค\\.|ก\\.พ\\.|มี\\.ค\\.|เม\\.ย\\.|พ\\.ค\\.|มิ\\.ย\\.|ก\\.ค\\.|ส\\.ค\\.|ก\\.ย\\.|ต\\.ค\\.|พ\\.ย\\.|ธ\\.ค\\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)([0-9]{4})$');
  if parts is not null then
    day_number := parts[1]::integer;
    year_number := parts[3]::integer;
    if year_number > 2400 then year_number := year_number - 543; end if;
    month_number := case parts[2]
      when 'ม.ค.' then 1 when 'ก.พ.' then 2 when 'มี.ค.' then 3 when 'เม.ย.' then 4
      when 'พ.ค.' then 5 when 'มิ.ย.' then 6 when 'ก.ค.' then 7 when 'ส.ค.' then 8
      when 'ก.ย.' then 9 when 'ต.ค.' then 10 when 'พ.ย.' then 11 when 'ธ.ค.' then 12
      when 'มกราคม' then 1 when 'กุมภาพันธ์' then 2 when 'มีนาคม' then 3 when 'เมษายน' then 4
      when 'พฤษภาคม' then 5 when 'มิถุนายน' then 6 when 'กรกฎาคม' then 7 when 'สิงหาคม' then 8
      when 'กันยายน' then 9 when 'ตุลาคม' then 10 when 'พฤศจิกายน' then 11 when 'ธันวาคม' then 12
    end;
    return make_date(year_number, month_number, day_number);
  end if;

  if source ~* '^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[[:space:]]+[0-9]{1,2},[[:space:]]*[0-9]{4}$' then
    return to_date(source, 'Mon FMDD, YYYY');
  end if;

  return null;
exception when others then
  return null;
end;
$$;

revoke all on function private.booking_date(text) from public;

alter table public.rental_bookings
  add column if not exists pickup_on date,
  add column if not exists return_on date,
  add column if not exists duplicate_of uuid references public.rental_bookings(id),
  add column if not exists duplicate_reason text,
  add column if not exists trash_reason text,
  add column if not exists previous_status text,
  add column if not exists trashed_at timestamptz,
  add column if not exists restored_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.rental_bookings
  drop constraint if exists rental_bookings_deletion_status_check;

alter table public.rental_bookings
  add constraint rental_bookings_deletion_status_check
  check (deletion_status in ('active', 'pending_move', 'pending_confirmation', 'restore_requested', 'pending_permanent_delete', 'deleted', 'restored', 'move_failed'));

create or replace function private.sync_rental_booking_dates()
returns trigger
language plpgsql
set search_path = pg_catalog, private
as $$
begin
  new.pickup_on := private.booking_date(new.pickup_date);
  new.return_on := private.booking_date(new.return_date);
  return new;
end;
$$;

revoke all on function private.sync_rental_booking_dates() from public;

drop trigger if exists rental_bookings_normalize_dates on public.rental_bookings;
create trigger rental_bookings_normalize_dates
  before insert or update of pickup_date, return_date on public.rental_bookings
  for each row execute function private.sync_rental_booking_dates();

update public.rental_bookings
set drive_file_id = coalesce(
      (regexp_match(drive_url, 'drive\\.google\\.com/file/d/([A-Za-z0-9_-]+)'))[1],
      (regexp_match(drive_url, '[?&]id=([A-Za-z0-9_-]+)'))[1],
      drive_file_id
    ),
    pickup_on = private.booking_date(pickup_date),
    return_on = private.booking_date(return_date)
where coalesce(btrim(drive_url), '') <> ''
   or pickup_on is null
   or return_on is null;

with ranked as (
  select id,
         first_value(id) over (partition by drive_file_id order by created_at asc nulls last, id) as original_id,
         row_number() over (partition by drive_file_id order by created_at asc nulls last, id) as sequence
  from public.rental_bookings
  where coalesce(btrim(drive_file_id), '') <> ''
)
update public.rental_bookings as booking
set duplicate_of = ranked.original_id,
    duplicate_reason = 'ไฟล์ Google Drive เดียวกัน — รอตรวจสอบก่อนลบ'
from ranked
where booking.id = ranked.id
  and ranked.sequence > 1
  and booking.duplicate_of is null;

create index if not exists rental_bookings_schedule_idx
  on public.rental_bookings (return_on, deletion_status);
create index if not exists rental_bookings_duplicate_idx
  on public.rental_bookings (duplicate_of)
  where duplicate_of is not null;
