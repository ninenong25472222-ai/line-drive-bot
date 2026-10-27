import { adminToken, forward, headers, json, options, settings } from "../_shared.js";

export async function onRequest(context) {
  const { request } = context;
  if (request.method === "OPTIONS") return options();
  const { url, anonKey } = settings(context);
  if (!url || !anonKey) return json({ error: "ระบบข้อมูลรถยังตั้งค่าไม่ครบ" }, 503);
  if (request.method === "GET") {
    const response = await fetch(`${url}/rest/v1/rental_cars?select=id,car_ref,model,license_plate,color,model_year,default_daily_rate,default_security_deposit,status,image_url,note,active,updated_at&order=model.asc,car_ref.asc`, { headers: headers(anonKey) });
    return response.ok ? forward(response) : json({ error: "โหลดข้อมูลรถไม่สำเร็จ" }, 502);
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const response = await fetch(`${url}/functions/v1/rental-admin/cars`, {
    method: "POST",
    headers: headers(anonKey, { "content-type": "application/json", "x-booking-edit-token": adminToken(request) }),
    body: await request.text(),
  });
  return forward(response);
}
