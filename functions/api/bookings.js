import { adminToken, forward, headers, json, options, settings } from "../_shared.js";

export async function onRequest(context) {
  const { request } = context;
  if (request.method === "OPTIONS") return options();
  const { url, anonKey } = settings(context);
  if (!url || !anonKey) return json({ error: "ระบบรายการจองยังตั้งค่าไม่ครบ" }, 503);

  if (request.method === "POST") {
    const response = await fetch(`${url}/functions/v1/rental-admin/bookings`, {
      method: "POST",
      headers: headers(anonKey, { "content-type": "application/json", "x-booking-edit-token": adminToken(request) }),
      body: await request.text(),
    });
    return forward(response);
  }
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const query = new URLSearchParams({
    select: "id,source,source_label,status,deletion_status,pending_deletion_at,trashed_at,restored_at,deleted_at,trash_reason,duplicate_of,duplicate_reason,company,booking_no,customer_name,customer_phone,customer_email,booking_channel,car_id,pickup_date,pickup_on,pickup_time,pickup_location,return_date,return_on,return_time,return_location,car,daily_rate,booking_deposit,security_deposit,delivery_fee,service_total,booking_note,wants_tax_invoice,tax_company_name,withhold_tax_5,file_name,drive_url,created_at",
    order: "pickup_date.asc.nullslast,pickup_time.asc.nullslast,created_at.desc",
    limit: "500",
  });
  const response = await fetch(`${url}/rest/v1/rental_bookings?${query}`, { headers: headers(anonKey) });
  if (!response.ok) {
    const detail = (await response.text()).replace(/[\r\n]+/g, " ").slice(0, 240);
    return json({ error: "โหลดรายการจองไม่สำเร็จ", upstream_status: response.status, detail }, 502);
  }
  return forward(response);
}
