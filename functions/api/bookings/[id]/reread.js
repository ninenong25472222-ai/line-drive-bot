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
  const contentType = response.headers.get("content-type") || "";
  let payload;
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    // Render can return an HTML error page during a cold start, proxy failure,
    // or rate limit. Keep the dashboard's API contract JSON so it can show a
    // useful explanation instead of a misleading JSON parse error.
    console.warn("BOOKING_REREAD_UPSTREAM_NON_JSON", {
      status: response.status,
      contentType: contentType.slice(0, 80),
    });
    const error = response.status === 429
      ? "ระบบอ่านไฟล์ถูกเรียกบ่อยเกินไป กรุณารอประมาณ 1 นาทีแล้วลองอีกครั้ง"
      : `บริการอ่านไฟล์ตอบกลับไม่ถูกต้อง (HTTP ${response.status}) กรุณาลองใหม่อีกครั้ง หากยังไม่สำเร็จให้แจ้งผู้ดูแล`;
    return json({ error }, response.ok ? 502 : response.status);
  }
  return json(payload, response.status);
}
