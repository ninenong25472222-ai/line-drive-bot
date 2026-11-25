alter table public.rental_bookings
  add column if not exists pricing_snapshot jsonb;

create or replace function private.audit_rental_booking_changes()
returns trigger language plpgsql set search_path = pg_catalog, private as $$
declare changes jsonb := '{}'::jsonb; history jsonb; field_name text; old_value jsonb; new_value jsonb;
begin
  foreach field_name in array array[
    'customer_name','customer_phone','booking_no','car','car_id',
    'pickup_date','pickup_time','return_date','return_time',
    'daily_rate','service_total','delivery_fee','booking_deposit','security_deposit','pricing_snapshot',
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
