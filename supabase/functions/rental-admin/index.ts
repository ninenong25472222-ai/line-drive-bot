import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const adminTokenHash = "364ce48661e97936f40da1f02ddf90dacf54b48dd236e70c495ee04f651f878c";
const cors = {
  "access-control-allow-origin": "https://line-drive-bot.pages.dev",
  "access-control-allow-headers": "authorization, apikey, content-type, x-booking-edit-token",
  "access-control-allow-methods": "POST, PATCH, OPTIONS",
  "content-type": "application/json; charset=utf-8",
};
const carStatuses = new Set(["ว่าง", "จองแล้ว", "กำลังใช้งาน", "ซ่อม", "งดใช้งาน"]);
const bookingStatuses = new Set(["รอตรวจสอบ", "ยืนยันแล้ว", "ผิดพลาด", "ยกเลิก"]);
const bookingOptionTypes = new Set(["channel", "location"]);
const lifecycleActions = new Set(["queue_trash", "restore", "confirm_delete", "delete_now"]);
const rentalStatusActions = new Set(["mark_delivered", "mark_returned", "cancel_booking", "reopen_booking"]);
const imageExtensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const money = (value: unknown) => { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const dateOk = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const timeOk = (value: string) => {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
};
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
  for (const field of ["car_id", "customer_name", "customer_phone", "customer_email", "booking_channel", "pickup_date", "pickup_time", "pickup_location", "return_date", "return_time", "return_location", "tax_company_name"]) row[field] = text(input[field], field.endsWith("date") ? 10 : field.endsWith("time") ? 5 : 500);
  row.booking_note = text(input.booking_note, 2000); row.wants_tax_invoice = Boolean(input.wants_tax_invoice); row.withhold_tax_5 = Boolean(input.withhold_tax_5);
  for (const field of ["daily_rate", "booking_deposit", "security_deposit", "delivery_fee", "service_total"]) row[field] = money(input[field]);
  return row;
}
function bookingUpdatePayload(input: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const field of ["customer_name", "customer_phone", "booking_no", "car", "pickup_date", "pickup_time", "pickup_location", "return_date", "return_time", "return_location"]) {
    if (field in input) row[field] = text(input[field], field.endsWith("_date") ? 10 : field.endsWith("_time") ? 5 : 500);
  }
  if ("car_id" in input) row.car_id = text(input.car_id, 80) || null;
  for (const field of ["daily_rate", "booking_deposit", "security_deposit", "delivery_fee"]) {
    if (field in input) row[field] = money(input[field]);
  }
  for (const field of ["wants_tax_invoice", "withhold_tax_5"]) {
    if (field in input) row[field] = input[field] === true || input[field] === "true" || input[field] === "on";
  }
  if ("tax_company_name" in input) row.tax_company_name = text(input.tax_company_name, 500);
  if ("status" in input && bookingStatuses.has(text(input.status))) row.status = text(input.status);
  return row;
}
async function bookingById(url: string, key: string, id: string) {
  const rows = await rest(url, key, `rental_bookings?id=eq.${encodeURIComponent(id)}&select=*`);
  return Array.isArray(rows) ? rows[0] : null;
}
async function lifecycleBooking(input: Record<string, unknown>, url: string, key: string, id: string) {
  const action = text(input.lifecycle_action, 40);
  if (!lifecycleActions.has(action)) return response({ error: "คำสั่งถังขยะไม่ถูกต้อง" }, 400);
  const current = await bookingById(url, key, id);
  if (!current) return response({ error: "ไม่พบรายการจอง" }, 404);
  const now = new Date().toISOString();
  const hasFile = Boolean(text(current.drive_file_id));
  const isDuplicate = Boolean(text(current.duplicate_of));
  let patch: Record<string, unknown>;
  if (action === "delete_now") {
    if (!["active", "restored", "pending_move", "move_failed"].includes(text(current.deletion_status || "active"))) return response({ error: "รายการนี้กำลังลบอยู่หรือถูกลบแล้ว" }, 409);
    patch = {
      previous_status: text(current.status),
      deletion_status: hasFile && !isDuplicate ? "pending_permanent_delete" : "deleted",
      pending_deletion_at: now,
      trashed_at: null,
      deleted_at: hasFile && !isDuplicate ? null : now,
      trash_reason: text(input.trash_reason, 500) || "ผู้ดูแลยืนยันลบถาวรจากหน้าเว็บ",
    };
  } else if (action === "queue_trash") {
    if (["pending_move", "pending_confirmation", "pending_permanent_delete", "deleted"].includes(text(current.deletion_status))) return response({ error: "รายการนี้อยู่ในขั้นตอนถังขยะแล้ว" }, 409);
    patch = {
      previous_status: text(current.status) || "รอตรวจสอบ",
      ...(isDuplicate ? {} : { status: "ยกเลิก" }),
      deletion_status: hasFile && !isDuplicate ? "pending_move" : "pending_confirmation",
      trash_reason: text(input.trash_reason, 500) || (isDuplicate ? "สำเนารายการ — ใช้ไฟล์ Google Drive เดียวกับรายการหลัก" : "ย้ายจากหน้ารายการจอง"),
      pending_deletion_at: hasFile && !isDuplicate ? null : now,
      trashed_at: hasFile && !isDuplicate ? null : now,
      restored_at: null,
      deleted_at: null,
    };
  } else if (action === "restore") {
    if (text(current.deletion_status) === "deleted") return response({ error: "รายการนี้ลบไฟล์ถาวรแล้ว จึงกู้คืนจากระบบไม่ได้" }, 409);
    patch = !isDuplicate && hasFile && text(current.deletion_status) === "pending_confirmation"
      ? { deletion_status: "restore_requested", restored_at: null }
      : { deletion_status: "restored", status: text(current.previous_status) || "รอตรวจสอบ", restored_at: now, pending_deletion_at: null, trash_reason: null };
  } else {
    if (text(current.deletion_status) !== "pending_confirmation") return response({ error: "ยืนยันลบได้เฉพาะรายการที่ย้ายเข้าถังขยะแล้ว" }, 409);
    patch = hasFile && !isDuplicate
      ? { deletion_status: "pending_permanent_delete" }
      : { deletion_status: "deleted", deleted_at: now };
  }
  patch.updated_at = now;
  const expectedStatus = text(current.deletion_status) || "active";
  const saved = await rest(url, key, `rental_bookings?id=eq.${encodeURIComponent(id)}&deletion_status=eq.${encodeURIComponent(expectedStatus)}`, { method: "PATCH", headers: { "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(patch) });
  const updated = Array.isArray(saved) ? saved[0] : saved;
  if (!updated) return response({ error: "สถานะรายการเปลี่ยนระหว่างทำงาน โปรดรีเฟรชแล้วลองอีกครั้ง" }, 409);
  return response(updated);
}
async function changeRentalStatus(input: Record<string, unknown>, url: string, key: string, id: string) {
  const action = text(input.rental_status_action, 40);
  if (!rentalStatusActions.has(action)) return response({ error: "คำสั่งเปลี่ยนสถานะไม่ถูกต้อง" }, 400);
  const current = await bookingById(url, key, id);
  if (!current) return response({ error: "ไม่พบรายการจอง" }, 404);
  const from = text(current.rental_status, 30) || "scheduled";
  const now = new Date().toISOString();
  let to = "";
  let reason = text(input.cancellation_reason, 500);
  const patch: Record<string, unknown> = { updated_at: now };
  if (action === "mark_delivered") {
    if (from !== "scheduled" || ["ยกเลิก", "ผิดพลาด"].includes(text(current.status))) return response({ error: "ส่งรถแล้วได้เฉพาะรายการที่ยังไม่ยกเลิก" }, 409);
    to = "delivered"; patch.delivered_at = now;
  } else if (action === "mark_returned") {
    if (from !== "delivered") return response({ error: "ยืนยันรับรถคืนได้หลังจากกดยืนยันส่งรถแล้ว" }, 409);
    to = "returned"; patch.returned_at = now;
  } else if (action === "cancel_booking") {
    if (from !== "scheduled" || ["ยกเลิก", "ผิดพลาด"].includes(text(current.status))) return response({ error: "ยกเลิกได้เฉพาะรายการที่ยังไม่ส่งรถ" }, 409);
    if (!reason) return response({ error: "กรอกเหตุผลการยกเลิกก่อนบันทึก" }, 400);
    to = "cancelled"; patch.cancelled_at = now; patch.cancellation_reason = reason;
    patch.status_before_cancel = text(current.status) || "รอตรวจสอบ"; patch.status = "ยกเลิก";
  } else {
    if (from !== "cancelled") return response({ error: "คืนสถานะได้เฉพาะรายการที่ยกเลิกแล้ว" }, 409);
    to = "scheduled"; patch.status = text(current.status_before_cancel) || "ยืนยันแล้ว";
  }
  const history = Array.isArray(current.rental_status_history) ? current.rental_status_history : [];
  patch.rental_status = to;
  patch.rental_status_history = [...history, { from, to, at: now, reason: reason || null }];
  const saved = await rest(url, key, `rental_bookings?id=eq.${encodeURIComponent(id)}&rental_status=eq.${encodeURIComponent(from)}&status=eq.${encodeURIComponent(text(current.status))}`, { method: "PATCH", headers: { "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(patch) });
  const updated = Array.isArray(saved) ? saved[0] : saved;
  if (!updated) return response({ error: "รายการเปลี่ยนสถานะระหว่างทำงาน โปรดรีเฟรชแล้วลองอีกครั้ง" }, 409);
  return response(updated);
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
  if (booking.wants_tax_invoice && !text(booking.tax_company_name)) return response({ error: "กรอกชื่อบริษัทสำหรับใบกำกับภาษีให้ครบ" }, 400);
  if (["daily_rate", "booking_deposit", "security_deposit", "delivery_fee", "service_total"].some((field) => booking[field] === null)) return response({ error: "ยอดเงินต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" }, 400);
  if (Number(booking.daily_rate) <= 0) return response({ error: "ราคาต่อวันต้องมากกว่า 0 บาท" }, 400);
  const rentalMinutes = (slot(text(booking.return_date), text(booking.return_time)) - slot(text(booking.pickup_date), text(booking.pickup_time))) / 60000;
  if (!Number.isFinite(rentalMinutes) || rentalMinutes <= 0) return response({ error: "วันและเวลาคืนรถต้องหลังวันและเวลาส่งรถ" }, 400);
  const billableDays = Math.max(1, Math.ceil(rentalMinutes / 1440));
  booking.service_total = (Math.round(Number(booking.daily_rate) * 100) * billableDays + Math.round(Number(booking.delivery_fee) * 100)) / 100;
  const found = await rest(url, key, `rental_cars?id=eq.${encodeURIComponent(text(booking.car_id))}&select=id,car_ref,model,status,active&limit=1`);
  const car = Array.isArray(found) ? found[0] : null;
  if (!car || !car.active || ["ซ่อม", "งดใช้งาน"].includes(car.status)) return response({ error: "รถคันนี้ไม่พร้อมรับงาน" }, 409);
  const candidates = await rest(url, key, `rental_bookings?car_id=eq.${encodeURIComponent(car.id)}&duplicate_of=is.null&deletion_status=in.(active,restored)&status=not.in.(ยกเลิก,ผิดพลาด)&pickup_on=lte.${encodeURIComponent(text(booking.return_date))}&return_on=gte.${encodeURIComponent(text(booking.pickup_date))}&select=id,pickup_date,pickup_time,return_date,return_time,customer_name,booking_no`);
  const conflict = (candidates || []).find((row: Record<string, unknown>) => dateOk(text(row.pickup_date)) && timeOk(text(row.pickup_time)) && dateOk(text(row.return_date)) && timeOk(text(row.return_time)) && overlaps(booking, row));
  if (conflict) return response({ error: "รถคันนี้มีคิวจองซ้อนในช่วงเวลาที่เลือก", conflict }, 409);
  const bookingNo = `WEB-${text(booking.pickup_date).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
  const created = await rest(url, key, "rental_bookings", { method: "POST", headers: { "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ ...booking, car: `${car.model}${car.car_ref ? ` · ${car.car_ref}` : ""}`, booking_no: bookingNo, source: "Dashboard", source_label: "เว็บไซต์ / ออกใบจอง", company: "Rental Desk", status: "ยืนยันแล้ว", file_hash: `manual:${crypto.randomUUID()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
  return response(Array.isArray(created) ? created[0] : created, 201);
}
async function updateBooking(req: Request, url: string, key: string, id: string) {
  const input = await req.json();
  if (typeof input === "object" && input && input.status === "ยกเลิก") return response({ error: "กรุณาใช้ปุ่มยกเลิกการจองและระบุเหตุผล" }, 400);
  if (typeof input === "object" && input && "rental_status_action" in input) return changeRentalStatus(input, url, key, id);
  if (typeof input === "object" && input && "lifecycle_action" in input) return lifecycleBooking(input, url, key, id);
  const booking = bookingUpdatePayload(input);
  if (!Object.keys(booking).length) return response({ error: "ไม่มีข้อมูลที่แก้ไขได้" }, 400);
  const scheduleFields = ["pickup_date", "pickup_time", "return_date", "return_time"];
  const scheduleChanged = scheduleFields.some((field) => field in input);
  const priceFields = ["daily_rate", "delivery_fee", "booking_deposit", "security_deposit"];
  const pricingChanged = priceFields.some((field) => field in input);
  const servicePriceChanged = ["daily_rate", "delivery_fee"].some((field) => field in input);
  const needsCurrent = "car_id" in input || scheduleChanged || pricingChanged || "wants_tax_invoice" in input || "withhold_tax_5" in input || "tax_company_name" in input;
  let current: Record<string, unknown> | null = null;
  if (needsCurrent) {
    current = await bookingById(url, key, id);
    if (!current) return response({ error: "ไม่พบรายการจอง" }, 404);
  }
  if ("car_id" in input || scheduleChanged) {
    const merged = { ...(current || {}), ...booking };
    const carId = text(merged.car_id, 80);
    if (!carId) {
      if ("car_id" in input) {
        booking.car_id = null;
        if ("car" in input) booking.car = text(input.car);
      }
    } else {
      const pickupDate = text(merged.pickup_date), pickupTime = text(merged.pickup_time);
      const returnDate = text(merged.return_date), returnTime = text(merged.return_time);
      if (!dateOk(pickupDate) || !timeOk(pickupTime) || !dateOk(returnDate) || !timeOk(returnTime)) return response({ error: "กรอกวันและเวลาให้ครบก่อนจับคู่รถ" }, 400);
      const start = slot(pickupDate, pickupTime), end = slot(returnDate, returnTime);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return response({ error: "วันและเวลาคืนรถต้องหลังวันและเวลาส่งรถ" }, 400);
      const found = await rest(url, key, `rental_cars?id=eq.${encodeURIComponent(carId)}&select=id,car_ref,model,status,active&limit=1`);
      const car = Array.isArray(found) ? found[0] : null;
      if (!car || !car.active || ["ซ่อม", "งดใช้งาน"].includes(text(car.status))) return response({ error: "รถคันนี้ไม่พร้อมรับงาน" }, 409);
      const assignmentChanged = String(current?.car_id || "") !== String(car.id);
      const intervalChanged = scheduleChanged && scheduleFields.some((field) => text(current?.[field]) !== text(merged[field]));
      if (assignmentChanged || intervalChanged) {
        const candidates = await rest(url, key, `rental_bookings?car_id=eq.${encodeURIComponent(car.id)}&id=neq.${encodeURIComponent(id)}&duplicate_of=is.null&deletion_status=in.(active,restored)&status=not.in.(ยกเลิก,ผิดพลาด)&pickup_on=lte.${encodeURIComponent(returnDate)}&return_on=gte.${encodeURIComponent(pickupDate)}&select=id,pickup_date,pickup_time,return_date,return_time,customer_name,booking_no`);
        const conflict = (candidates || []).find((row: Record<string, unknown>) => dateOk(text(row.pickup_date)) && timeOk(text(row.pickup_time)) && dateOk(text(row.return_date)) && timeOk(text(row.return_time)) && overlaps(merged, row));
        if (conflict) return response({ error: "รถคันนี้มีคิวจองซ้อนในช่วงเวลาที่เลือก", conflict }, 409);
      }
      booking.car_id = car.id;
      booking.car = `${car.model}${car.car_ref ? ` · ${car.car_ref}` : ""}`;
    }
  }
  if (pricingChanged) {
    for (const field of priceFields) if (field in booking && booking[field] === null) return response({ error: "ยอดเงินต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" }, 400);
    const merged = { ...(current || {}), ...booking };
    const rate = Number(merged.daily_rate), fee = Number(merged.delivery_fee || 0);
    if (servicePriceChanged && rate <= 0) return response({ error: "ราคาต่อวันต้องมากกว่า 0 บาทเมื่อปรับค่าเช่า" }, 400);
    if (rate > 0 && (servicePriceChanged || scheduleChanged)) {
      const pickupDate = text(merged.pickup_date), pickupTime = text(merged.pickup_time);
      const returnDate = text(merged.return_date), returnTime = text(merged.return_time);
      if (!dateOk(pickupDate) || !timeOk(pickupTime) || !dateOk(returnDate) || !timeOk(returnTime)) return response({ error: "กรอกวันและเวลาให้ครบก่อนคำนวณราคา" }, 400);
      const duration = slot(returnDate, returnTime) - slot(pickupDate, pickupTime);
      if (!Number.isFinite(duration) || duration <= 0) return response({ error: "วันและเวลาคืนรถต้องหลังวันและเวลาส่งรถ" }, 400);
      const days = Math.max(1, Math.ceil(duration / 86400000));
      booking.service_total = (Math.round(rate * 100) * days + Math.round(fee * 100)) / 100;
    }
  } else if (scheduleChanged && Number(current?.daily_rate) > 0) {
    const merged = { ...(current || {}), ...booking };
    const start = slot(text(merged.pickup_date), text(merged.pickup_time));
    const end = slot(text(merged.return_date), text(merged.return_time));
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return response({ error: "วันและเวลาคืนรถต้องหลังวันและเวลาส่งรถ" }, 400);
    booking.service_total = (Math.round(Number(merged.daily_rate) * 100) * Math.max(1, Math.ceil((end - start) / 86400000)) + Math.round(Number(merged.delivery_fee || 0) * 100)) / 100;
  }
  if (booking.wants_tax_invoice === true && !text(booking.tax_company_name ?? current?.tax_company_name)) return response({ error: "กรอกชื่อบริษัทสำหรับใบกำกับภาษีให้ครบ" }, 400);
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
