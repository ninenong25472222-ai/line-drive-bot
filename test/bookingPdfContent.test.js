const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");

function loadAdminHandler(fetchMock) {
  const file = path.join(__dirname, "..", "supabase", "functions", "rental-admin", "index.ts");
  let source = stripTypeScriptTypes(fs.readFileSync(file, "utf8"));
  source = source.replace(/^import\s+["'][^"']+["'];\s*/m, "");
  source = source.replace("if (!await authorized(req)) return response({ error: \"รหัสผู้ดูแลไม่ถูกต้อง\" }, 403);", "if (false && !await authorized(req)) return response({ error: \"รหัสผู้ดูแลไม่ถูกต้อง\" }, 403);");
  let handler;
  const Deno = { serve(fn) { handler = fn; }, env: { get(name) { return ({ SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: "test-key" })[name] || ""; } } };
  vm.runInNewContext(source, { Deno, fetch: fetchMock, crypto, TextEncoder, TextDecoder, Uint8Array, Response, URL, URLSearchParams, Request, AbortController, atob, console, setTimeout, clearTimeout });
  return handler;
}

test("protected booking PDF content route returns verified PDF bytes from Drive", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const calls = [];
  const handler = loadAdminHandler(async (url, init = {}) => {
    calls.push(String(url));
    if (String(url).includes("/rest/v1/rental_bookings")) return new Response(JSON.stringify([{ drive_url: "https://drive.google.com/file/d/driveFile_123456789/view", file_name: "ใบจอง.pdf", booking_no: "B-1" }]), { status: 200 });
    assert.match(String(url), /drive\.usercontent\.google\.com\/download\?id=driveFile_123456789/);
    return new Response(Buffer.from("%PDF-1.7 sample"), { status: 200, headers: { "content-type": "application/pdf" } });
  });
  const response = await handler(new Request(`https://db.example/functions/v1/rental-admin/bookings/${id}/content`));
  assert.equal(response.status, 200, JSON.stringify({ body: await response.clone().text(), calls }));
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.match(response.headers.get("content-disposition"), /^inline;/);
  assert.equal(await response.text(), "%PDF-1.7 sample");
  assert.equal(calls.length, 2);
});

test("protected booking PDF content route rejects a Google Drive HTML error page", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const handler = loadAdminHandler(async (url) => String(url).includes("/rest/v1/rental_bookings")
    ? new Response(JSON.stringify([{ drive_url: "https://drive.google.com/file/d/driveFile_123456789/view", file_name: "booking.pdf" }]), { status: 200 })
    : new Response("<html>permission needed</html>", { status: 200, headers: { "content-type": "text/html" } }));
  const response = await handler(new Request(`https://db.example/functions/v1/rental-admin/bookings/${id}/content`));
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /ดาวน์โหลด PDF ไม่สำเร็จ/);
});

test("protected booking PDF content route falls back to Drive's alternate download endpoint", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const requested = [];
  const handler = loadAdminHandler(async (url) => {
    requested.push(String(url));
    if (String(url).includes("/rest/v1/rental_bookings")) return new Response(JSON.stringify([{ drive_url: "https://drive.google.com/file/d/driveFile_123456789/view", file_name: "booking.pdf" }]), { status: 200 });
    if (String(url).includes("drive.usercontent.google.com")) return new Response("<html>confirmation required</html>", { status: 200 });
    return new Response(Buffer.from("%PDF-1.7 from alternate"), { status: 200, headers: { "content-type": "application/pdf" } });
  });
  const response = await handler(new Request(`https://db.example/functions/v1/rental-admin/bookings/${id}/content`));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "%PDF-1.7 from alternate");
  assert.equal(requested.length, 3);
  assert.match(requested[2], /drive\.google\.com\/uc\?export=download/);
});
