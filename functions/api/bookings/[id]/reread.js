import { adminToken, json, options } from "../../../_shared.js";

export async function onRequest(context) {
  const { request } = context;
  if (request.method === "OPTIONS") return options();
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = adminToken(request);
  if (!token) return json({ error: "กรอกรหัสผู้ดูแลเพื่ออ่านไฟล์" }, 403);
  const id = String(context.params.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "รหัสรายการจองไม่ถูกต้อง" }, 400);
  const base = String(context.env.RENTAL_BOT_URL || "https://line-drive-bot-1.onrender.com").replace(/\/$/, "");
  let response;
  try {
    response = await fetch(`${base}/admin/bookings/${encodeURIComponent(id)}/read`, {
      method: "POST",
      headers: { "x-booking-edit-token": token },
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    return json({ error: "บริการอ่านไฟล์กำลังเริ่มทำงานหรือเชื่อมต่อไม่ได้ กรุณารอสักครู่แล้วลองใหม่" }, 503);
  }
  const body = await response.text();
  return new Response(body || "{}", {
    status: response.status,
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store", "content-type": response.headers.get("content-type") || "application/json; charset=utf-8" },
  });
}
