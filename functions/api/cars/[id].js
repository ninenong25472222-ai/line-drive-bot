import { adminToken, forward, headers, json, options, settings } from "../../_shared.js";

export async function onRequest(context) {
  const { request } = context;
  if (request.method === "OPTIONS") return options();
  if (request.method !== "PATCH") return json({ error: "Method not allowed" }, 405);
  const { url, anonKey } = settings(context);
  if (!url || !anonKey) return json({ error: "ระบบข้อมูลรถยังตั้งค่าไม่ครบ" }, 503);
  const response = await fetch(`${url}/functions/v1/rental-admin/cars/${encodeURIComponent(context.params.id)}`, {
    method: "PATCH",
    headers: headers(anonKey, { "content-type": "application/json", "x-booking-edit-token": adminToken(request) }),
    body: await request.text(),
  });
  return forward(response);
}
