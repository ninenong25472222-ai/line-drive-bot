import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const adminTokenHash = "364ce48661e97936f40da1f02ddf90dacf54b48dd236e70c495ee04f651f878c";
const cors = {
  "access-control-allow-origin": "https://line-drive-bot.netlify.app",
  "access-control-allow-headers": "authorization, apikey, content-type, x-booking-edit-token",
  "access-control-allow-methods": "POST, PATCH, OPTIONS",
  "content-type": "application/json; charset=utf-8",
};
const carStatuses = new Set(["ว่าง", "จองแล้ว", "กำลังใช้งาน", "ซ่อม", "งดใช้งาน"]);
const bookingStatuses = new Set(["รอตรวจสอบ", "ยืนยันแล้ว", "ผิดพลาด", "ยกเลิก"]);
const bookingOptionTypes = new Set(["channel", "location"]);
const imageExtensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const money = (value: unknown) => { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const dateOk = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const timeOk = (value: string) => /^\d{2}:\d{2}$/.test(value);
const slot = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`).getTime();

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function sameHash(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0; for (let index = 0; index < left.length; index++) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}
async function authorized(req: Request) {
  const supplied = req.headers.get("x-booking-edit-token") || "";
  return sameHash(await sha256(supplied), adminTokenHash);
}
async function rest(url: string, key: string, path: string, init: RequestInit = {}) {
  const result = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init.headers || {}) } });
  const body = await result.text();
  if (!result.ok) throw new Error(`DATABASE_${result.status}:${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : null;
}
function carPayload(input: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const field of ["car_ref", "model", "license_plate", "color", "image_url", "note"]) if (field in input) row[field] = text(input[field], field === "note" ? 2000 : 500);
  if ("model_year" in input) { const year = Number(input.model_year); if (Number.isInteger(year) && year >= 1900 && year <= 2200) row.model_year = year; }
  for (const field of ["default_daily_rate", "default_security_deposit"]) if (field in input) { const value = money(input[field]); if (value !== null) row[field] = value; }
  if ("status" in input && carStatuses.has(text(input.status))) row.status = text(input.status);
  if ("active" in input) row.active = Boolean(input.active);
  return row;
}
function bookingPayload(input: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const field of ["car_id", "customer_name", "customer_phone", "customer_email", "booking_channel", "pickup_date", "pickup_time", "pickup_location", "return_date", "return_time", "return_location"]) row[field] = text(input[field], field.endsWith("date") ? 10 : field.endsWith("time") ? 5 : 500);
  row.booking_note = text(input.booking_note, 2000); row.wants_tax_invoice = Boolean(input.wants_tax_invoice);
  for (const field of ["daily_rate", "booking_deposit", "security_deposit", "delivery_fee", "service_total"]) row[field] = money(input[field]);
  return row;
}
function bookingUpdatePayload(input: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const field of ["customer_name", "customer_phone", "booking_no", "car", "pickup_date", "pickup_time", "pickup_location", "return_date", "return_time", "return_location"]) {
    if (field in input) row[field] = text(input[field], field.endsWith("_date") ? 10 : field.endsWith("_time") ? 5 : 500);
  }
  if ("status" in input && bookingStatuses.has(text(input.status))) row.status = text(input.status);
  return row;
}
function overlaps(candidate: Record<string, unknown>, existing: Record<string, unknown>) {
  return slot(String(candidate.pickup_date), String(candidate.pickup_time)) < slot(String(existing.return_date), String(existing.return_time)) && slot(String(candidate.return_date), String(candidate.return_time)) > slot(String(existing.pickup_date), String(existing.pickup_time));
}
async function uploadCarPhoto(input: Record<string, unknown>, url: string, key: string) {
  const base64 = typeof input.image_data === "string" ? input.image_data : "";
  const contentType = text(input.image_type, 100).toLowerCase();
  if (!base64) return "";
  if (!imageExtensions[contentType]) throw new Error("IMAGE_TYPE_NOT_ALLOWED");
  if (base64.length > 7_000_000 || !/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error("IMAGE_TOO_LARGE_OR_INVALID");
  const binary = atob(base64);
  if (binary.length > 5 * 1024 * 1024) throw new Error("IMAGE_TOO_LARGE_OR_INVALID");
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const path = `cars/${crypto.randomUUID()}.${imageExtensions[contentType]}`;
  const result = await fetch(`${url}/storage/v1/object/car-photos/${path}`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": contentType, "x-upsert": "false" }, body: bytes });
  if (!result.ok) throw new Error(`CAR_PHOTO_UPLOAD_${result.status}`);
  return `${url}/storage/v1/object/public/car-photos/${path}`;
}
async function saveCar(req: Request, url: string, key: string, id = "") {
  const input = await req.json(); const car = carPayload(input);
  const uploadedImageUrl = await uploadCarPhoto(input, url, key);
  if (uploadedImageUrl) car.image_url = uploadedImageUrl;
  if (!id && (!car.car_ref || !car.model)) return response({ error: "กรอกรหัสเรียกรถและรุ่นรถ" }, 400);
  if (id && !Object.keys(car).length) return response({ error: "ข้อมูลรถไม่ครบ" }, 400);
  car.updated_at = new Date().toISOString();
  const saved = await rest(url, key, id ? `rental_cars?id=eq.${encodeURIComponent(id)}` : "rental_cars", { method: id ? "PATCH" : "POST", headers: { "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(car) });
  const row = Array.isArray(saved) ? saved[0] : saved;
  return row ? response(row, id ? 200 : 201) : response({ error: "ไม่พบรถ" }, 404);
}
async function saveBookingOption(req: Request, url: string, key: string) {
  const input = await req.json();
  const optionType = text(input.option_type, 30), label = text(input.label, 120);
  if (!bookingOptionTypes.has(optionType) || !label) return response({ error: "ระบุชนิดและชื่อรายการให้ครบ" }, 400);
  const saved = await rest(url, key, "rental_booking_options?on_conflict=option_type,label", { method: "POST", headers: { "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ option_type: optionType, label }) });
  return response(Array.isArray(saved) && saved[0] ? saved[0] : { option_type: optionType, label }, 201);
}
async function saveBooking(req: Request, url: string, key: string) {
  const booking = bookingPayload(await req.json());
  if (!text(booking.car_id) || !text(booking.customer_name) || !dateOk(text(booking.pickup_date)) || !dateOk(text(booking.return_date)) || !timeOk(text(booking.pickup_time)) || !timeOk(text(booking.return_time))) return response({ error: "กรอกข้อมูลลูกค้า รถ วัน และเวลาให้ครบ" }, 400);
  if (["daily_rate", "booking_deposit", "security_deposit", "delivery_fee", "service_total"].some((field) => booking[field] === null)) return response({ error: "ยอดเงินต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" }, 400);
  if (slot(text(booking.pickup_date), text(booking.pickup_time)) >= slot(text(booking.return_date), text(booking.return_time))) return response({ error: "วันและเวลาคืนรถต้องหลังวันและเวลาส่งรถ" }, 400);
  const found = await rest(url, key, `rental_cars?id=eq.${encodeURIComponent(text(booking.car_id))}&select=id,car_ref,model,status,active&limit=1`);
  const car = Array.isArray(found) ? found[0] : null;
  if (!car || !car.active || ["ซ่อม", "งดใช้งาน"].includes(car.status)) return response({ error: "รถคันนี้ไม่พร้อมรับงาน" }, 409);
  const candidates = await rest(url, key, `rental_bookings?car_id=eq.${encodeURIComponent(car.id)}&deletion_status=in.(active,restored)&status=not.in.(ยกเลิก,ผิดพลาด)&pickup_date=lte.${encodeURIComponent(text(booking.return_date))}&return_date=gte.${encodeURIComponent(text(booking.pickup_date))}&select=id,pickup_date,pickup_time,return_date,return_time,customer_name,booking_no`);
  const conflict = (candidates || []).find((row: Record<string, unknown>) => dateOk(text(row.pickup_date)) && timeOk(text(row.pickup_time)) && dateOk(text(row.return_date)) && timeOk(text(row.return_time)) && overlaps(booking, row));
  if (conflict) return response({ error: "รถคันนี้มีคิวจองซ้อนในช่วงเวลาที่เลือก", conflict }, 409);
  const bookingNo = `WEB-${text(booking.pickup_date).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
  const created = await rest(url, key, "rental_bookings", { method: "POST", headers: { "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ ...booking, car: `${car.model}${car.car_ref ? ` · ${car.car_ref}` : ""}`, booking_no: bookingNo, source: "Dashboard", source_label: "เว็บไซต์ / ออกใบจอง", company: "Rental Desk", status: "ยืนยันแล้ว", file_hash: `manual:${crypto.randomUUID()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
  return response(Array.isArray(created) ? created[0] : created, 201);
}
async function updateBooking(req: Request, url: string, key: string, id: string) {
  const booking = bookingUpdatePayload(await req.json());
  if (!Object.keys(booking).length) return response({ error: "ไม่มีข้อมูลที่แก้ไขได้" }, 400);
  booking.updated_at = new Date().toISOString();
  const saved = await rest(url, key, `rental_bookings?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(booking) });
  const row = Array.isArray(saved) ? saved[0] : saved;
  return row ? response(row) : response({ error: "ไม่พบรายการจอง" }, 404);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const url = Deno.env.get("SUPABASE_URL") || "", key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return response({ error: "Server configuration is incomplete" }, 500);
  if (!await authorized(req)) return response({ error: "รหัสผู้ดูแลไม่ถูกต้อง" }, 403);
  try {
    const path = new URL(req.url).pathname.replace(/\/$/, "");
    if (req.method === "POST" && path.endsWith("/cars")) return saveCar(req, url, key);
    const carId = path.match(/\/cars\/([0-9a-f-]{36})$/i)?.[1];
    if (req.method === "PATCH" && carId) return saveCar(req, url, key, carId);
    if (req.method === "POST" && path.endsWith("/bookings")) return saveBooking(req, url, key);
    if (req.method === "POST" && path.endsWith("/options")) return saveBookingOption(req, url, key);
    const bookingId = path.match(/\/bookings\/([0-9a-f-]{36})$/i)?.[1];
    if (req.method === "PATCH" && bookingId) return updateBooking(req, url, key, bookingId);
    return response({ error: "Method not allowed" }, 405);
  } catch (error) { console.error("RENTAL_ADMIN_FAILED", error); return response({ error: "บันทึกข้อมูลไม่สำเร็จ" }, 502); }
});
