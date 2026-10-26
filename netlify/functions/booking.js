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

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "PATCH, OPTIONS",
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
  if (event.httpMethod !== "PATCH") return json(405, { error: "Method not allowed" });

  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = String(process.env.SUPABASE_ANON_KEY || "");
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  const allowedEmails = configuredEmails();
  const id = bookingIdFromPath(event.path);

  // Fail closed. The service-role key is used only after a logged-in user has
  // been checked against the explicit admin allow-list.
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !allowedEmails.size) {
    return json(503, { error: "Booking editing is not configured" });
  }
  if (!id) return json(400, { error: "Missing booking id" });

  let user;
  try {
    user = await getAuthorizedUser(event, supabaseUrl, anonKey);
  } catch {
    return json(401, { error: "Unauthorized" });
  }

  if (!user?.email || !allowedEmails.has(String(user.email).toLowerCase())) {
    return json(403, { error: "Forbidden" });
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
