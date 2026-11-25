import { adminToken, forward, headers, json, options, settings } from "../../_shared.js";

export async function onRequest(context) {
  const { request, params } = context;
  if (request.method === "OPTIONS") return options();
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const token = adminToken(request);
  if (!token) return json({ error: "กรอกรหัสผู้ดูแลก่อนตรวจการแชร์รูป" }, 403);
  const { url, anonKey } = settings(context);
  if (!url || !anonKey) return json({ error: "ระบบข้อมูลรถยังตั้งค่าไม่ครบ" }, 503);
  const response = await fetch(`${url}/functions/v1/rental-admin/cars/${encodeURIComponent(params.id)}/photo`, { headers: headers(anonKey, { "x-booking-edit-token": token }) });
  return forward(response);
}
