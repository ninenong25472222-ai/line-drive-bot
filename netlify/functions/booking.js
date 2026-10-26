const EDITABLE_FIELDS = new Set([
  "customer_name",
  "customer_phone",
  "booking_no",
  "car",
  "pickup_date",
  "pickup_time",
  "pickup_location",
  "return_date",
  "return_time",
  "return_location",
  "status",
]);

const ALLOWED_STATUSES = new Set([
  "รอตรวจสอบ",
  "ยืนยันแล้ว",
  "ผิดพลาด",
  "ยกเลิก",
]);

const REPARSE_FIELDS = {
  bookingNo: "booking_no",
  customerName: "customer_name",
  customerPhone: "customer_phone",
  pickupDate: "pickup_date",
  pickupTime: "pickup_time",
  pickupLocation: "pickup_location",
  returnDate: "return_date",
  returnTime: "return_time",
  returnLocation: "return_location",
  car: "car",
};

const THAI_MONTHS = {
  "ม.ค.": "01", "ก.พ.": "02", "มี.ค.": "03", "เม.ย.": "04",
  "พ.ค.": "05", "มิ.ย.": "06", "ก.ค.": "07", "ส.ค.": "08",
  "ก.ย.": "09", "ต.ค.": "10", "พ.ย.": "11", "ธ.ค.": "12",
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type, x-booking-edit-token",
      "access-control-allow-methods": "PATCH, POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function configuredEmails() {
  return new Set(
    String(process.env.DASHBOARD_ALLOWED_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function bookingIdFromPath(pathname = "") {
  const match = String(pathname).match(/\/(?:booking|bookings)\/([^/?]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function cleanPatch(value) {
  return String(value == null ? "" : value).trim().slice(0, 500);
}

function missing(value) {
  return !cleanPatch(value);
}

function driveFileIdFromUrl(value = "") {
  const match = String(value).match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : "";
}

function normalizedDate(value = "") {
  const source = cleanPatch(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return source;

  const numeric = source.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
  if (numeric) {
    const year = Number(numeric[3]) > 2400 ? Number(numeric[3]) - 543 : Number(numeric[3]);
    return `${year}-${String(numeric[2]).padStart(2, "0")}-${String(numeric[1]).padStart(2, "0")}`;
  }

  const thai = source.replace(/\s+/g, " ").match(/^(\d{1,2})\s+([ก-๙]\.?[ก-๙]?\.?)\s+(\d{4})$/);
  if (thai && THAI_MONTHS[thai[2]]) {
    const year = Number(thai[3]) > 2400 ? Number(thai[3]) - 543 : Number(thai[3]);
    return `${year}-${THAI_MONTHS[thai[2]]}-${String(thai[1]).padStart(2, "0")}`;
  }

  return source;
}

function reparsedPatch(current = {}, parsed = {}) {
  const patch = {};
  const foundFields = [];
  for (const [parserField, databaseField] of Object.entries(REPARSE_FIELDS)) {
    let value = cleanPatch(parsed[parserField]);
    if (databaseField === "pickup_date" || databaseField === "return_date") value = normalizedDate(value);
    if (!value) continue;
    foundFields.push(databaseField);
    if (!cleanPatch(current[databaseField])) patch[databaseField] = value;
  }
  return { patch, foundFields };
}

async function loadBooking(supabaseUrl, serviceRoleKey, id) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/rental_bookings?id=eq.${encodeURIComponent(id)}&select=*`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  if (!response.ok) throw new Error("BOOKING_LOOKUP_FAILED");
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : null;
}

async function reparseBooking({ supabaseUrl, serviceRoleKey, id }) {
  const current = await loadBooking(supabaseUrl, serviceRoleKey, id);
  if (!current) return { error: "Booking not found", statusCode: 404 };
  if (!missing(current.pickup_date) && !missing(current.return_date)) {
    return { error: "This booking already has complete dates", statusCode: 409 };
  }

  const driveFileId = driveFileIdFromUrl(current.drive_url);
  if (!driveFileId) return { error: "This booking has no supported Google Drive PDF", statusCode: 422 };

  const fileResponse = await fetch(
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveFileId)}&export=download&confirm=t`,
  );
  if (!fileResponse.ok) return { error: "Could not download booking file", statusCode: 502 };

  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  if (!buffer.subarray(0, 4).equals(Buffer.from("%PDF"))) {
    return { error: "The attached file is not a PDF", statusCode: 422 };
  }

  // Load the full PDF/OCR reader only for this explicit operator action.
  const { readPDF } = require("../../services/pdfReader");
  const parserService = require("../../services/parserService");
  const parsed = parserService.parse(await readPDF(buffer)) || {};
  const { patch, foundFields } = reparsedPatch(current, parsed);
  if (!foundFields.length) return { error: "No booking details were found in this file", statusCode: 422 };
  if (!Object.keys(patch).length) return { booking: current, updatedFields: [], foundFields };

  patch.updated_at = new Date().toISOString();
  const response = await fetch(
    `${supabaseUrl}/rest/v1/rental_bookings?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
    },
  );
  if (!response.ok) return { error: "Could not save extracted booking details", statusCode: 502 };
  const updated = await response.json();
  return { booking: Array.isArray(updated) ? updated[0] : current, updatedFields: Object.keys(patch).filter((field) => field !== "updated_at"), foundFields };
}

async function getAuthorizedUser(event, supabaseUrl, anonKey) {
  const authorization = String(event.headers?.authorization || event.headers?.Authorization || "");
  if (!/^Bearer\s+\S+$/i.test(authorization)) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });

  if (!response.ok) return null;
  return response.json();
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  const isReparse = event.httpMethod === "POST" && /\/reparse\/?(?:\?|$)/.test(String(event.path || event.rawUrl || ""));
  if (event.httpMethod !== "PATCH" && !isReparse) return json(405, { error: "Method not allowed" });

  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  const editToken = String(process.env.BOOKING_EDIT_TOKEN || "");
  const suppliedToken = String(event.headers?.["x-booking-edit-token"] || event.headers?.["X-Booking-Edit-Token"] || "");
  const id = bookingIdFromPath(event.path || event.rawUrl || "");

  // Re-reading is available from the public Dashboard, but its write access
  // remains server-side and is restricted to records with missing dates.
  if (!supabaseUrl || !serviceRoleKey || (!isReparse && !editToken)) {
    return json(503, { error: "Booking editing is not configured" });
  }
  if (!id) return json(400, { error: "Missing booking id" });

  if (!isReparse && (!suppliedToken || suppliedToken !== editToken)) {
    return json(403, { error: "Forbidden" });
  }

  if (isReparse) {
    try {
      const result = await reparseBooking({ supabaseUrl, serviceRoleKey, id });
      if (result.error) return json(result.statusCode || 500, { error: result.error });
      return json(200, { booking: result.booking, updatedFields: result.updatedFields, foundFields: result.foundFields });
    } catch (error) {
      console.error("BOOKING_REPARSE_FAILED", error?.message || error);
      return json(500, { error: "Could not re-read booking file" });
    }
  }

  let input;
  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const patch = {};
  for (const [field, value] of Object.entries(input)) {
    if (EDITABLE_FIELDS.has(field)) patch[field] = cleanPatch(value);
  }
  if (!Object.keys(patch).length) return json(400, { error: "No editable fields supplied" });
  if (patch.status && !ALLOWED_STATUSES.has(patch.status)) {
    return json(400, { error: "Invalid booking status" });
  }
  patch.updated_at = new Date().toISOString();

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rental_bookings?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
    },
  );

  if (!response.ok) return json(502, { error: "Could not update booking" });
  const updated = await response.json();
  if (!Array.isArray(updated) || !updated[0]) return json(404, { error: "Booking not found" });
  return json(200, updated[0]);
};

module.exports.bookingIdFromPath = bookingIdFromPath;
module.exports.configuredEmails = configuredEmails;
module.exports.driveFileIdFromUrl = driveFileIdFromUrl;
module.exports.normalizedDate = normalizedDate;
module.exports.reparsedPatch = reparsedPatch;
module.exports.missing = missing;
