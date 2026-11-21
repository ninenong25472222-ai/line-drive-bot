import { adminToken, headers, json, options, settings } from "../../../_shared.js";

export async function onRequest(context) {
  const { request } = context;
  if (request.method === "OPTIONS") return options();
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const token = adminToken(request);
  if (!token) return json({ error: "กรอกรหัสผู้ดูแลเพื่อเปิดไฟล์" }, 403);
  const { url, anonKey } = settings(context);
  if (!url || !anonKey) return json({ error: "ระบบไฟล์ใบจองยังตั้งค่าไม่ครบ" }, 503);
  const id = String(context.params.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "รหัสรายการจองไม่ถูกต้อง" }, 400);
  const download = new URL(request.url).searchParams.get("download") === "1";
  const suffix = download ? "?download=1" : "";
  const response = await fetch(`${url}/functions/v1/rental-admin/bookings/${encodeURIComponent(id)}/content${suffix}`, {
    headers: headers(anonKey, { "x-booking-edit-token": token }),
  });
  const responseType = response.headers.get("content-type") || "application/json; charset=utf-8";
  return new Response(response.body, {
    status: response.status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-booking-edit-token",
      "access-control-allow-methods": "GET, OPTIONS",
      "cache-control": "no-store",
      "content-type": responseType,
      ...(response.headers.get("content-disposition") ? { "content-disposition": response.headers.get("content-disposition") } : {}),
      "x-content-type-options": "nosniff",
    },
  });
}
