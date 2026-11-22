import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = { "access-control-allow-origin": "https://line-drive-bot.pages.dev", "access-control-allow-headers": "authorization, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS", "content-type": "application/json; charset=utf-8" };
const preserveFields = ["booking_no", "customer_name", "customer_phone", "customer_email", "pickup_date", "pickup_time", "pickup_location", "return_date", "return_time", "return_location", "car", "drive_file_id", "drive_url"];
const writableFields = ["source", "source_label", "status", "company", "booking_no", "customer_name", "customer_phone", "customer_email", "pickup_date", "pickup_time", "pickup_location", "return_date", "return_time", "return_location", "car", "file_name", "file_hash", "drive_file_id", "drive_url", "updated_at"];
const textLimits: Record<string, number> = { source: 40, source_label: 100, status: 40, company: 100, booking_no: 120, customer_name: 200, customer_phone: 80, customer_email: 254, pickup_date: 30, pickup_time: 20, pickup_location: 300, return_date: 30, return_time: 20, return_location: 300, car: 200, file_name: 255, file_hash: 64, drive_file_id: 200, drive_url: 1000, updated_at: 40 };
// Dedicated high-entropy server-to-server credential; only its SHA-256 verifier is deployed here.
const bookingWriteTokenHash = "8325556a57703e704971b9554d2a9f068262bf0e07998bfca748abf81b64a8c3";
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const clean = (value: unknown) => String(value ?? "").trim();
const missing = (value: unknown) => !clean(value);
async function matchesBookingWriteToken(token: string) {
  if (!token) return false;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  const expected = Uint8Array.from(bookingWriteTokenHash.match(/.{2}/g) || [], byte => parseInt(byte, 16));
  if (digest.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < digest.length; index++) mismatch |= digest[index] ^ expected[index];
  return mismatch === 0;
}
function sanitizeBooking(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const row: Record<string, string> = {};
  for (const field of writableFields) {
    if (field in source) row[field] = clean(source[field]).slice(0, textLimits[field]);
  }
  return row;
}
async function readLimitedBody(req: Request, maxBytes: number) {
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
function driveFileId(value: unknown) {
  const source = clean(value);
  return source.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/i)?.[1]
    || source.match(/[?&]id=([A-Za-z0-9_-]+)/i)?.[1]
    || "";
}

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
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") || "", key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !key) return respond({ error: "Server configuration is incomplete" }, 500);
    const authorization = req.headers.get("authorization") || "";
    const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!await matchesBookingWriteToken(supplied)) return respond({ error: "Unauthorized" }, 401);
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") || "")) return respond({ error: "Content-Type must be application/json" }, 415);
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 65536) return respond({ error: "Request is too large" }, 413);
    const rawBody = await readLimitedBody(req, 65536);
    if (rawBody === null) return respond({ error: "Request is too large" }, 413);
    const parsed = JSON.parse(rawBody);
    if (parsed?.reparse_only === true) return respond({ error: "Date re-reading requires administrator authorization" }, 403);
    const payload = sanitizeBooking(parsed);
    if (!payload) return respond({ error: "Invalid booking payload" }, 400);
    if (!/^[a-f0-9]{64}$/i.test(payload.file_hash || "")) return respond({ error: "file_hash must be a SHA-256 hex digest" }, 400);
    payload.drive_file_id = clean(payload.drive_file_id) || driveFileId(payload.drive_url);
    // File hashes can differ after OCR or a partner re-exports a PDF.  The
    // Drive ID is the stable identity, so reject a second booking for it.
    if (payload.drive_file_id) {
      const sameDriveFile = await getBooking(url, key, `drive_file_id=eq.${encodeURIComponent(payload.drive_file_id)}`);
      if (sameDriveFile) {
        const patch = onlyMissing(sameDriveFile, payload, preserveFields);
        const booking = Object.keys(patch).length ? await patchBooking(url, key, sameDriveFile.id, patch) : sameDriveFile;
        return booking ? respond({ ok: true, duplicate: true, duplicateReason: "same_drive_file" }) : respond({ error: "Could not update existing booking" }, 502);
      }
    }
    const current = await getBooking(url, key, `file_hash=eq.${encodeURIComponent(clean(payload.file_hash))}`);
    if (current) {
      const patch = onlyMissing(current, payload, preserveFields);
      const booking = Object.keys(patch).length ? await patchBooking(url, key, current.id, patch) : current;
      return booking ? respond({ ok: true, duplicate: true }) : respond({ error: "Could not update booking" }, 502);
    }
    const row = Object.fromEntries(writableFields.filter((field) => field in payload).map((field) => [field, payload[field]]));
    const response = await fetch(`${url}/rest/v1/rental_bookings?on_conflict=file_hash`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(row) });
    if (!response.ok) {
      const detail = (await response.text()).replace(/[\r\n]+/g, " ").slice(0, 240);
      return respond({ error: "Could not save booking", detail }, response.status);
    }
    return respond({ ok: true, duplicate: false });
  } catch { return respond({ error: "Request could not be processed" }, 500); }
});
