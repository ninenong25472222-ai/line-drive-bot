export const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-booking-edit-token",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
  "cache-control": "no-store",
};

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

export function options() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function settings(context) {
  const url = String(context.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = String(context.env.SUPABASE_ANON_KEY || "");
  return { url, anonKey };
}

export function headers(anonKey, extra = {}) {
  // The current Supabase publishable key is an API key, not a JWT.  Sending it
  // as `Authorization: Bearer` makes some endpoints try to parse it as a JWT.
  // Keep the legacy header only for existing JWT-shaped anon keys.
  const authorization = anonKey.startsWith("eyJ") ? { Authorization: `Bearer ${anonKey}` } : {};
  return { apikey: anonKey, ...authorization, ...extra };
}

export async function forward(response) {
  const body = await response.text();
  return new Response(body || "{}", {
    status: response.status,
    headers: { ...corsHeaders, "content-type": response.headers.get("content-type") || "application/json; charset=utf-8" },
  });
}

export function adminToken(request) {
  return String(request.headers.get("x-booking-edit-token") || "").trim().slice(0, 200);
}
