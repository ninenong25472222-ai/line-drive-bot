import { adminToken, forward, headers, json, options, settings } from "../_shared.js";

export async function onRequest(context) {
  const { request } = context;
  if (request.method === "OPTIONS") return options();
  const { url, anonKey } = settings(context);
  if (!url || !anonKey) return json({ error: "ระบบคิวซิงก์ยังตั้งค่าไม่ครบ" }, 503);
  const token = adminToken(request);
  if (!token) return json({ error: "กรอกรหัสผู้ดูแลก่อนดูคิวซิงก์" }, 403);
  const path = new URL(request.url).pathname;
  const retry = path.match(/\/api\/sync-jobs\/([0-9a-f-]{36})\/retry$/i);
  if (request.method === "POST" && retry) {
    return forward(await fetch(`${url}/functions/v1/rental-admin/sync-jobs/${retry[1]}/retry`, { method: "POST", headers: headers(anonKey, { "x-booking-edit-token": token }) }));
  }
  if (request.method !== "GET" || !path.endsWith("/api/sync-jobs")) return json({ error: "Method not allowed" }, 405);
  return forward(await fetch(`${url}/functions/v1/rental-admin/sync-jobs`, { headers: headers(anonKey, { "x-booking-edit-token": token }) }));
}
