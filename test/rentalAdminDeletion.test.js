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
  assert.doesNotMatch(source, /^import\s/m, "Edge-only imports are removed in this isolated handler test");
  let handler;
  const Deno = { serve(fn) { handler = fn; }, env: { get(name) { return ({ SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: "test-key" })[name] || ""; } } };
  vm.runInNewContext(source, { Deno, fetch: fetchMock, crypto, TextEncoder, Uint8Array, Response, URL, Request, atob, console });
  assert.equal(typeof handler, "function");
  return handler;
}

async function deleteRequest(row) {
  const id = row.id;
  const calls = [];
  const fetchMock = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (init.method === "PATCH") {
      row = { ...row, ...JSON.parse(init.body) };
      return new Response(JSON.stringify([row]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify([row]), { status: 200, headers: { "content-type": "application/json" } });
  };
  const handler = loadAdminHandler(fetchMock);
  const response = await handler(new Request(`https://db.example/functions/v1/rental-admin/bookings/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ lifecycle_action: "delete_now" }) }));
  return { response, calls, row };
}

test("one-step delete accepts an active confirmed booking and preserves its monthly booking data", async () => {
  const initial = { id: "11111111-1111-4111-8111-111111111111", status: "ยืนยันแล้ว", deletion_status: "active", drive_file_id: "drive-file-1", service_total: 2700, booking_no: "WEB-TEST-1" };
  const { response, calls, row } = await deleteRequest(initial);
  assert.equal(response.status, 200);
  assert.equal(row.deletion_status, "pending_permanent_delete");
  assert.equal(row.status, initial.status);
  assert.equal(row.drive_file_id, initial.drive_file_id);
  assert.equal(row.service_total, initial.service_total);
  assert.match(calls[1].url, /deletion_status=eq\.active/);
});

test("one-step delete of a duplicate archives only that row and never targets the shared Drive file", async () => {
  const initial = { id: "22222222-2222-4222-8222-222222222222", status: "ยืนยันแล้ว", deletion_status: "active", drive_file_id: "shared-file", duplicate_of: "11111111-1111-4111-8111-111111111111", service_total: 2700 };
  const { response, row } = await deleteRequest(initial);
  assert.equal(response.status, 200);
  assert.equal(row.deletion_status, "deleted");
  assert.equal(row.drive_file_id, "shared-file");
  assert.equal(row.duplicate_of, initial.duplicate_of);
  assert.equal(row.service_total, 2700);
});
