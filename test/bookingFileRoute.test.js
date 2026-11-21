const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

function loadFileHandler(fetchMock) {
  const path = require.resolve("../functions/api/bookings/[id]/file.js");
  const source = fs.readFileSync(path, "utf8")
    .replace(/^import .*;\r?\n/, "")
    .replace("export async function onRequest", "async function onRequest") + "\nglobalThis.onRequest = onRequest;";
  const context = {
    URL, Response, fetch: fetchMock,
    adminToken: (request) => request.headers.get("x-booking-edit-token") || "",
    headers: (_anonKey, extra = {}) => extra,
    forward: async (response) => new Response(await response.text(), { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json" } }),
    json: (body, status = 200) => Response.json(body, { status }),
    options: () => new Response(null, { status: 204 }),
    settings: () => ({ url: "https://example.supabase.co", anonKey: "public-test-key" }),
  };
  require("node:vm").runInNewContext(source, context);
  return context.onRequest;
}

test("booking file route refuses to reveal a Drive URL without the administrator PIN", async () => {
  let called = false;
  const handler = loadFileHandler(async () => { called = true; return Response.json({}); });
  const response = await handler({
    request: new Request("https://app.example/api/bookings/11111111-1111-4111-8111-111111111111/file"),
    params: { id: "11111111-1111-4111-8111-111111111111" },
  });
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error, "กรอกรหัสผู้ดูแลเพื่อเปิดไฟล์");
  assert.equal(called, false);
});

test("booking file route passes the PIN to the protected Google Drive link service", async () => {
  let requestUrl, requestInit;
  const handler = loadFileHandler(async (url, init) => {
    requestUrl = new URL(url); requestInit = init;
    return Response.json({ url: "https://drive.google.com/file/d/private-file/view" });
  });
  const id = "11111111-1111-4111-8111-111111111111";
  const response = await handler({
    request: new Request(`https://app.example/api/bookings/${id}/file?download=1`, { headers: { "x-booking-edit-token": "staff-pin" } }),
    params: { id },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.url, "https://drive.google.com/file/d/private-file/view");
  assert.equal(requestUrl.pathname, `/functions/v1/rental-admin/bookings/${id}/file`);
  assert.equal(requestUrl.searchParams.get("download"), "1");
  assert.equal(requestInit.headers["x-booking-edit-token"], "staff-pin");
});

function loadContentHandler(fetchMock) {
  const path = require.resolve("../functions/api/bookings/[id]/content.js");
  const source = fs.readFileSync(path, "utf8")
    .replace(/^import .*;\r?\n/gm, "")
    .replace("export async function onRequest", "async function onRequest") + "\nglobalThis.onRequest = onRequest;";
  const context = {
    URL, Response, fetch: fetchMock,
    adminToken: (request) => request.headers.get("x-booking-edit-token") || "",
    headers: (_anonKey, extra = {}) => extra,
    json: (body, status = 200) => Response.json(body, { status }),
    options: () => new Response(null, { status: 204 }),
    settings: () => ({ url: "https://example.supabase.co", anonKey: "public-test-key" }),
  };
  require("node:vm").runInNewContext(source, context);
  return context.onRequest;
}

test("booking content proxy requires the admin PIN and preserves real PDF bytes", async () => {
  let called = false;
  const handler = loadContentHandler(async (url, init) => {
    called = true;
    assert.match(url, /\/bookings\/11111111-1111-4111-8111-111111111111\/content\?download=1$/);
    assert.equal(init.headers["x-booking-edit-token"], "staff-pin");
    return new Response(Buffer.from("%PDF-1.7 sample"), { headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=sample.pdf" } });
  });
  const id = "11111111-1111-4111-8111-111111111111";
  const response = await handler({
    request: new Request(`https://app.example/api/bookings/${id}/content?download=1`, { headers: { "x-booking-edit-token": "staff-pin" } }),
    params: { id },
  });
  assert.equal(called, true);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(await response.text(), "%PDF-1.7 sample");
});
