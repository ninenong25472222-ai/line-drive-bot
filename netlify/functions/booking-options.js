function reply(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, x-booking-edit-token", "access-control-allow-methods": "GET, POST, OPTIONS" }, body: JSON.stringify(body) };
}
function text(value, max = 500) { return String(value == null ? "" : value).trim().slice(0, max); }

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return reply(204, {});
  const url = text(process.env.SUPABASE_URL).replace(/\/$/, "");
  const anonKey = text(process.env.SUPABASE_ANON_KEY);
  if (!url || !anonKey) return reply(503, { error: "ระบบรายการเลือกยังตั้งค่าไม่ครบ" });
  try {
    if (event.httpMethod === "GET") {
      const response = await fetch(`${url}/rest/v1/rental_booking_options?select=option_type,label&order=label.asc`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
      const body = await response.text();
      return { statusCode: response.status, headers: reply(200, {}).headers, body: body || "[]" };
    }
    if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });
    const response = await fetch(`${url}/functions/v1/rental-admin/options`, { method: "POST", headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "content-type": "application/json", "x-booking-edit-token": text(event.headers?.["x-booking-edit-token"] || event.headers?.["X-Booking-Edit-Token"], 200) }, body: event.body || "{}" });
    const body = await response.text();
    return { statusCode: response.status, headers: reply(200, {}).headers, body: body || "{}" };
  } catch (error) {
    console.error("BOOKING_OPTIONS_FAILED", error?.message || error);
    return reply(502, { error: "บันทึกรายการเลือกไม่สำเร็จ" });
  }
};
