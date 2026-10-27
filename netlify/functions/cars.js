const CAR_FIELDS = new Set([
  "car_ref", "model", "license_plate", "color", "model_year",
  "default_daily_rate", "default_security_deposit", "status", "image_url", "note", "active",
]);
const CAR_STATUSES = new Set(["ว่าง", "จองแล้ว", "กำลังใช้งาน", "ซ่อม", "งดใช้งาน"]);

function reply(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-booking-edit-token",
      "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function text(value, length = 500) { return String(value == null ? "" : value).trim().slice(0, length); }
function money(value) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
function carIdFromPath(path = "") {
  const match = String(path).match(/\/(?:cars)\/([^/?]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function carPatch(input = {}) {
  const patch = {};
  for (const [key, value] of Object.entries(input)) {
    if (!CAR_FIELDS.has(key)) continue;
    if (["default_daily_rate", "default_security_deposit"].includes(key)) {
      const amount = money(value); if (amount == null) continue; patch[key] = amount;
    } else if (key === "model_year") {
      const year = Number(value); if (Number.isInteger(year) && year >= 1900 && year <= 2200) patch[key] = year;
    } else if (key === "active") patch[key] = Boolean(value);
    else patch[key] = text(value);
  }
  if (patch.status && !CAR_STATUSES.has(patch.status)) delete patch.status;
  return patch;
}

async function supabase(url, key, path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(options.headers || {}) },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`SUPABASE_${response.status}:${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : null;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return reply(204, {});
  const url = text(process.env.SUPABASE_URL).replace(/\/$/, "");
  const anonKey = text(process.env.SUPABASE_ANON_KEY);
  const key = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const editToken = text(process.env.BOOKING_EDIT_TOKEN);
  if (!url || !anonKey) return reply(503, { error: "ระบบข้อมูลรถยังตั้งค่าไม่ครบ" });

  try {
    if (event.httpMethod === "GET") {
      const cars = await supabase(url, anonKey, "rental_cars?select=id,car_ref,model,license_plate,color,model_year,default_daily_rate,default_security_deposit,status,image_url,note,active,updated_at&order=model.asc,car_ref.asc");
      return reply(200, cars);
    }
    if (!["POST", "PATCH"].includes(event.httpMethod)) return reply(405, { error: "Method not allowed" });
    if (!key) return reply(503, { error: "ต้องตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน Netlify ก่อนบันทึกข้อมูลรถ" });
    const supplied = text(event.headers?.["x-booking-edit-token"] || event.headers?.["X-Booking-Edit-Token"]);
    if (!editToken || supplied !== editToken) return reply(403, { error: "รหัสผู้ดูแลไม่ถูกต้อง" });
    let input;
    try { input = JSON.parse(event.body || "{}"); } catch { return reply(400, { error: "ข้อมูลไม่ถูกต้อง" }); }
    const patch = carPatch(input);
    if (event.httpMethod === "POST") {
      if (!patch.car_ref || !patch.model) return reply(400, { error: "กรอกรหัสเรียกรถและรุ่นรถ" });
      patch.updated_at = new Date().toISOString();
      const created = await supabase(url, key, "rental_cars", { method: "POST", headers: { "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(patch) });
      return reply(201, Array.isArray(created) ? created[0] : created);
    }
    const id = carIdFromPath(event.path || event.rawUrl || "");
    if (!id || !Object.keys(patch).length) return reply(400, { error: "ข้อมูลรถไม่ครบ" });
    patch.updated_at = new Date().toISOString();
    const updated = await supabase(url, key, `rental_cars?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(patch) });
    if (!Array.isArray(updated) || !updated[0]) return reply(404, { error: "ไม่พบรถ" });
    return reply(200, updated[0]);
  } catch (error) {
    console.error("CARS_API_FAILED", error?.message || error);
    return reply(502, { error: "บันทึกข้อมูลรถไม่สำเร็จ" });
  }
};

module.exports.carPatch = carPatch;
module.exports.carIdFromPath = carIdFromPath;
