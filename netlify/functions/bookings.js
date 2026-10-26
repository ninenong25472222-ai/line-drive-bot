exports.handler = async function handler(event) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  };

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = String(process.env.SUPABASE_ANON_KEY || "");
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  const allowedEmails = new Set(String(process.env.DASHBOARD_ALLOWED_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
  const authorization = String(event.headers?.authorization || event.headers?.Authorization || "");

  if (!url || !anonKey || !serviceRoleKey || !allowedEmails.size) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: "Dashboard access is not configured" }) };
  }
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Sign-in required" }) };
  }

  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  if (!userResponse.ok) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Invalid session" }) };
  }
  const user = await userResponse.json();
  if (!user?.email || !allowedEmails.has(String(user.email).toLowerCase())) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "Dashboard access denied" }) };
  }

  const params = new URLSearchParams({
    select: "id,source,source_label,status,company,booking_no,customer_name,customer_phone,pickup_date,pickup_time,pickup_location,return_date,return_time,return_location,car,file_name,drive_url,created_at",
    order: "pickup_date.asc.nullslast,pickup_time.asc.nullslast,created_at.desc",
    limit: "500",
  });
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rental_bookings?${params}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  const text = await response.text();
  if (!response.ok) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: "Supabase query failed", detail: text.slice(0, 500) }) };
  }
  return { statusCode: 200, headers, body: text };
};
