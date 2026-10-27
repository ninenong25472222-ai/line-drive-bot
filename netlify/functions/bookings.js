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
  try {
    // Privileged validation and database writes are kept inside Supabase.
    const supplied = clean(event.headers?.["x-booking-edit-token"] || event.headers?.["X-Booking-Edit-Token"], 200);
    const response = await fetch(`${url}/functions/v1/rental-admin/bookings`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "x-booking-edit-token": supplied,
      },
      body: event.body || "{}",
    });
    const body = await response.text();
    return { statusCode: response.status, headers: json(200, {}).headers, body: body || "{}" };
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

  if (event.httpMethod === "POST") return createBooking(event, url, key);
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
