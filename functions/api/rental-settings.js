import { adminToken, forward, headers, json, options, settings } from "../_shared.js";

export async function onRequest(context) {
  const { request } = context;
  if (request.method === "OPTIONS") return options();
  if (!["GET", "PATCH"].includes(request.method)) return json({ error: "Method not allowed" }, 405);
  const { url, anonKey } = settings(context);
  if (!url || !anonKey) return json({ error: "ระบบตั้งค่าข้อมูลยังตั้งค่าไม่ครบ" }, 503);
  const response = await fetch(`${url}/functions/v1/rental-admin/settings`, {
    method: request.method,
    headers: headers(anonKey, { "content-type": "application/json", "x-booking-edit-token": adminToken(request) }),
    ...(request.method === "PATCH" ? { body: await request.text() } : {}),
  });
  return forward(response);
}
