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
    select: "id,source,source_label,status,deletion_status,pending_deletion_at,company,booking_no,customer_name,customer_phone,pickup_date,pickup_time,pickup_location,return_date,return_time,return_location,car,file_name,drive_url,created_at",
    order: "pickup_date.asc.nullslast,pickup_time.asc.nullslast,created_at.desc",
    limit: "500",
  });
  const response = await fetch(`${url}/rest/v1/rental_bookings?${query}`, { headers: headers(anonKey) });
  if (!response.ok) return json({ error: "โหลดรายการจองไม่สำเร็จ" }, 502);
  return forward(response);
}
