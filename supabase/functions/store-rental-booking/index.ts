import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "access-control-allow-origin": "https://line-drive-bot.netlify.app",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json; charset=utf-8",
};
const dateFields = ["pickup_date", "pickup_time", "return_date", "return_time"];

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const clean = (value: unknown) => String(value ?? "").trim();
const missing = (value: unknown) => !clean(value);

async function reparseOnly(payload: Record<string, unknown>, url: string, key: string) {
  const id = clean(payload.id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return respond({ error: "Invalid booking id" }, 400);
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const found = await fetch(`${url}/rest/v1/rental_bookings?id=eq.${encodeURIComponent(id)}&select=*`, { headers });
  const rows = await found.json();
  const current = Array.isArray(rows) ? rows[0] : null;
  if (!current) return respond({ error: "Booking not found" }, 404);
  if (!missing(current.pickup_date) && !missing(current.return_date)) return respond({ error: "Booking dates are already complete" }, 409);

  const patch: Record<string, string> = {};
  for (const field of dateFields) {
    const value = clean(payload[field]);
    if (missing(current[field]) && value) patch[field] = value;
  }
  if (!Object.keys(patch).length) return respond({ error: "No missing booking dates were found in the file" }, 422);
  patch.updated_at = new Date().toISOString();
  const saved = await fetch(`${url}/rest/v1/rental_bookings?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { ...headers, "content-type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(patch),
  });
  const updated = await saved.json();
  if (!saved.ok || !Array.isArray(updated) || !updated[0]) return respond({ error: "Could not save extracted details" }, 502);
  return respond({ booking: updated[0], updatedFields: Object.keys(patch).filter((field) => field !== "updated_at") });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  try {
    const payload = await req.json();
    const url = Deno.env.get("SUPABASE_URL") || "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !key) return respond({ error: "Server configuration is incomplete" }, 500);
    if (payload?.reparse_only === true) return reparseOnly(payload, url, key);
    if (!payload?.file_hash) return respond({ error: "file_hash is required" }, 400);
    const response = await fetch(`${url}/rest/v1/rental_bookings?on_conflict=file_hash`, {
      method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(payload),
    });
    const text = await response.text();
    return new Response(text || "{}", { status: response.ok ? 200 : response.status, headers: cors });
  } catch (error) {
    return respond({ error: String(error?.message || error) }, 500);
  }
});
