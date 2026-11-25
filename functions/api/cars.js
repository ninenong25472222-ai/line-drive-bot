import { adminToken, forward, headers, json, options, settings } from "../_shared.js";

export async function onRequest(context) {
  const { request } = context;
  if (request.method === "OPTIONS") return options();
  const { url, anonKey } = settings(context);
  if (!url || !anonKey) return json({ error: "ระบบข้อมูลรถยังตั้งค่าไม่ครบ" }, 503);
  if (request.method === "GET") {
    const token = adminToken(request);
    if (!token) return json({ error: "กรอกรหัสผู้ดูแลก่อนดูข้อมูลรถ" }, 403);
    return forward(await fetch(`${url}/functions/v1/rental-admin/cars`, { headers: headers(anonKey, { "x-booking-edit-token": token }) }));
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const response = await fetch(`${url}/functions/v1/rental-admin/cars`, {
    method: "POST",
    headers: headers(anonKey, { "content-type": "application/json", "x-booking-edit-token": adminToken(request) }),
    body: await request.text(),
  });
  return forward(response);
}
