import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = { "access-control-allow-origin": "https://line-drive-bot.netlify.app", "access-control-allow-headers": "authorization, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS", "content-type": "application/json; charset=utf-8" };
const repairFields = ["pickup_date", "pickup_time", "return_date", "return_time"];
const preserveFields = ["booking_no", "customer_name", "customer_phone", "customer_email", "pickup_date", "pickup_time", "pickup_location", "return_date", "return_time", "return_location", "car", "drive_file_id", "drive_url"];
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const clean = (value: unknown) => String(value ?? "").trim();
const missing = (value: unknown) => !clean(value);

async function getBooking(url: string, key: string, filter: string) {
  const response = await fetch(`${url}/rest/v1/rental_bookings?${filter}&select=*`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : null;
}
async function patchBooking(url: string, key: string, id: string, patch: Record<string, string>) {
  const response = await fetch(`${url}/rest/v1/rental_bookings?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
  const rows = await response.json();
  return response.ok && Array.isArray(rows) ? rows[0] : null;
}
function onlyMissing(current: Record<string, unknown>, payload: Record<string, unknown>, fields: string[]) {
  return fields.reduce((patch: Record<string, string>, field) => { const value = clean(payload[field]); if (missing(current[field]) && value) patch[field] = value; return patch; }, {});
}
async function reparseOnly(payload: Record<string, unknown>, url: string, key: string) {
  const id = clean(payload.id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return respond({ error: "Invalid booking id" }, 400);
  const current = await getBooking(url, key, `id=eq.${encodeURIComponent(id)}`);
  if (!current) return respond({ error: "Booking not found" }, 404);
  if (!missing(current.pickup_date) && !missing(current.return_date)) return respond({ error: "Booking dates are already complete" }, 409);
  const patch = onlyMissing(current, payload, repairFields);
  if (!Object.keys(patch).length) return respond({ error: "No missing booking dates were found in the file" }, 422);
  const booking = await patchBooking(url, key, current.id, patch);
  return booking ? respond({ booking, updatedFields: Object.keys(patch) }) : respond({ error: "Could not save extracted details" }, 502);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  try {
    const payload = await req.json();
    const url = Deno.env.get("SUPABASE_URL") || "", key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !key) return respond({ error: "Server configuration is incomplete" }, 500);
    if (payload?.reparse_only === true) return reparseOnly(payload, url, key);
    if (!payload?.file_hash) return respond({ error: "file_hash is required" }, 400);
    const current = await getBooking(url, key, `file_hash=eq.${encodeURIComponent(clean(payload.file_hash))}`);
    if (current) {
      const patch = onlyMissing(current, payload, preserveFields);
      const booking = Object.keys(patch).length ? await patchBooking(url, key, current.id, patch) : current;
      return booking ? respond(Array.isArray(booking) ? booking : [booking]) : respond({ error: "Could not update booking" }, 502);
    }
    const response = await fetch(`${url}/rest/v1/rental_bookings?on_conflict=file_hash`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(payload) });
    const text = await response.text();
    return new Response(text || "{}", { status: response.ok ? 200 : response.status, headers: cors });
  } catch (error) { return respond({ error: String(error?.message || error) }, 500); }
});
