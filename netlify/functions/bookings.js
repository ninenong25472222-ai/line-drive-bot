const crypto = require("node:crypto");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-booking-edit-token",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function clean(value, length = 500) { return String(value == null ? "" : value).trim().slice(0, length); }
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value); }
function validTime(value) { return /^\d{2}:\d{2}$/.test(value); }
function amount(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; }
function slot(date, time) { return new Date(`${date}T${time}:00+07:00`).getTime(); }

function overlapsBooking(candidate, existing) {
  const from = slot(candidate.pickup_date, candidate.pickup_time);
  const to = slot(candidate.return_date, candidate.return_time);
  const existingFrom = slot(existing.pickup_date, existing.pickup_time);
  const existingTo = slot(existing.return_date, existing.return_time);
  return Number.isFinite(from) && Number.isFinite(to) && Number.isFinite(existingFrom) && Number.isFinite(existingTo) && from < existingTo && to > existingFrom;
}

async function api(url, key, path, options = {}) {
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(options.headers || {}) },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`SUPABASE_${response.status}:${body.slice(0, 240)}`);
  return body ? JSON.parse(body) : null;
}

function bookingInput(input = {}) {
  const booking = {
    car_id: clean(input.car_id, 80),
    customer_name: clean(input.customer_name), customer_phone: clean(input.customer_phone, 80), customer_email: clean(input.customer_email),
    booking_channel: clean(input.booking_channel, 120), pickup_date: clean(input.pickup_date, 10), pickup_time: clean(input.pickup_time, 5),
    pickup_location: clean(input.pickup_location), return_date: clean(input.return_date, 10), return_time: clean(input.return_time, 5),
    return_location: clean(input.return_location), booking_note: clean(input.booking_note, 2000),
    wants_tax_invoice: Boolean(input.wants_tax_invoice),
  };
  for (const key of ["daily_rate", "booking_deposit", "security_deposit", "delivery_fee", "service_total"]) {
    booking[key] = amount(input[key]);
  }
  return booking;
}

async function createBooking(event, url, key) {
  const editToken = clean(process.env.BOOKING_EDIT_TOKEN);
  const supplied = clean(event.headers?.["x-booking-edit-token"] || event.headers?.["X-Booking-Edit-Token"]);
  if (!editToken || supplied !== editToken) return json(403, { error: "รหัสผู้ดูแลไม่ถูกต้อง" });
  let input;
  try { input = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "ข้อมูลใบจองไม่ถูกต้อง" }); }
  const booking = bookingInput(input);
  if (!booking.car_id || !booking.customer_name || !validDate(booking.pickup_date) || !validDate(booking.return_date) || !validTime(booking.pickup_time) || !validTime(booking.return_time)) {
    return json(400, { error: "กรอกข้อมูลลูกค้า รถ วัน และเวลาให้ครบ" });
  }
  if (!Object.values({ daily_rate: booking.daily_rate, booking_deposit: booking.booking_deposit, security_deposit: booking.security_deposit, delivery_fee: booking.delivery_fee, service_total: booking.service_total }).every((value) => value != null)) {
    return json(400, { error: "ยอดเงินต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" });
  }
  if (slot(booking.pickup_date, booking.pickup_time) >= slot(booking.return_date, booking.return_time)) return json(400, { error: "วันและเวลาคืนรถต้องหลังวันและเวลาส่งรถ" });
  try {
    const cars = await api(url, key, `rental_cars?id=eq.${encodeURIComponent(booking.car_id)}&select=id,car_ref,model,status,active&limit=1`);
    const car = Array.isArray(cars) ? cars[0] : null;
    if (!car || !car.active || ["ซ่อม", "งดใช้งาน"].includes(car.status)) return json(409, { error: "รถคันนี้ไม่พร้อมรับงาน" });
    const candidates = await api(url, key, `rental_bookings?car_id=eq.${encodeURIComponent(car.id)}&deletion_status=in.(active,restored)&status=not.in.(ยกเลิก,ผิดพลาด)&pickup_date=lte.${encodeURIComponent(booking.return_date)}&return_date=gte.${encodeURIComponent(booking.pickup_date)}&select=id,pickup_date,pickup_time,return_date,return_time,customer_name,booking_no`);
    const conflict = (candidates || []).find((row) => validDate(row.pickup_date) && validTime(row.pickup_time) && validDate(row.return_date) && validTime(row.return_time) && overlapsBooking(booking, row));
    if (conflict) return json(409, { error: "รถคันนี้มีคิวจองซ้อนในช่วงเวลาที่เลือก", conflict });
    const now = new Date();
    const bookingNo = `WEB-${booking.pickup_date.replace(/-/g, "")}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
    const row = {
      ...booking,
      car: `${car.model}${car.car_ref ? ` · ${car.car_ref}` : ""}`,
      booking_no: bookingNo,
      source: "Dashboard", source_label: "เว็บไซต์ / ออกใบจอง", company: "Rental Desk", status: "ยืนยันแล้ว",
      file_hash: `manual:${crypto.randomUUID()}`, created_at: now.toISOString(), updated_at: now.toISOString(),
    };
    const created = await api(url, key, "rental_bookings", { method: "POST", headers: { "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(row) });
    return json(201, Array.isArray(created) ? created[0] : created);
  } catch (error) {
    console.error("CREATE_BOOKING_FAILED", error?.message || error);
    return json(502, { error: "บันทึกใบจองไม่สำเร็จ" });
  }
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(204, {});

  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  // Public dashboard reading must only use the publishable/anon key. Never
  // substitute a service-role key here because that would bypass RLS.
  const key = String(process.env.SUPABASE_ANON_KEY || "");

  if (!url || !key) {
    return json(500, { error: "Missing Netlify Supabase environment variables" });
  }

  if (event.httpMethod === "POST") return createBooking(event, url, String(process.env.SUPABASE_SERVICE_ROLE_KEY || ""));
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  const params = new URLSearchParams({
    select: "id,source,source_label,status,deletion_status,pending_deletion_at,company,booking_no,customer_name,customer_phone,pickup_date,pickup_time,pickup_location,return_date,return_time,return_location,car,file_name,drive_url,created_at",
    order: "pickup_date.asc.nullslast,pickup_time.asc.nullslast,created_at.desc",
    limit: "500",
  });
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rental_bookings?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await response.text();
  if (!response.ok) {
    return json(502, { error: "Supabase query failed", detail: text.slice(0, 500) });
  }
  return { statusCode: 200, headers: json(200, {}).headers, body: text };
};

module.exports.bookingInput = bookingInput;
module.exports.overlapsBooking = overlapsBooking;
