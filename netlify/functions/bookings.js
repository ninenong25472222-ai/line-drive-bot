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
  // Public dashboard reading must only use the publishable/anon key. Never
  // substitute a service-role key here because that would bypass RLS.
  const key = String(process.env.SUPABASE_ANON_KEY || "");

  if (!url || !key) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing Netlify Supabase environment variables" }) };
  }

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
    return { statusCode: 502, headers, body: JSON.stringify({ error: "Supabase query failed", detail: text.slice(0, 500) }) };
  }
  return { statusCode: 200, headers, body: text };
};
