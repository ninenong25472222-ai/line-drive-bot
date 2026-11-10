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
  const token = adminToken(request);
  if (!token) return json({ error: "กรอกรหัสผู้ดูแลเพื่อดูข้อมูล" }, 403);
  const response = await fetch(`${url}/functions/v1/rental-admin/bookings`, {
    method: "GET",
    headers: headers(anonKey, { "x-booking-edit-token": token }),
  });
  return forward(response);
}
