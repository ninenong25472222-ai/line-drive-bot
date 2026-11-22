const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");

function loadStoreHandler(fetchMock) {
  const file = path.join(__dirname, "..", "supabase", "functions", "store-rental-booking", "index.ts");
  let source = stripTypeScriptTypes(fs.readFileSync(file, "utf8"));
  source = source.replace(/^import\s+["'][^"']+["'];\s*/m, "");
  const testTokenHash = require("node:crypto").createHash("sha256").update("server-only-test-secret").digest("hex");
  source = source.replace(/const bookingWriteTokenHash = ["'][a-f0-9]{64}["'];/, `const bookingWriteTokenHash = "${testTokenHash}";`);
  let handler;
  const Deno = {
    serve(fn) { handler = fn; },
    env: { get(name) { return ({ SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: "server-only-test-secret" })[name] || ""; } }
  };
  vm.runInNewContext(source, { Deno, fetch: fetchMock, crypto, TextEncoder, TextDecoder, Uint8Array, Response, URL, URLSearchParams, Request, console });
  return handler;
}

const hash = "a".repeat(64);
const body = { source: "LINE", source_label: "LINE / Partner", status: "รอตรวจสอบ", company: "Klook", file_hash: hash, file_name: "booking.pdf", unexpected_admin_field: true };

test("store endpoint rejects unauthenticated callers before any database request", async () => {
  let databaseCalls = 0;
  const handler = loadStoreHandler(async () => { databaseCalls++; return new Response("[]"); });
  const response = await handler(new Request("https://db.example/functions/v1/store-rental-booking", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  assert.equal(response.status, 401);
  assert.equal(databaseCalls, 0);
});

test("store endpoint only inserts allowlisted booking fields for the authenticated bot", async () => {
  let inserted;
  const handler = loadStoreHandler(async (url, init = {}) => {
    if (String(url).includes("/rest/v1/rental_bookings?") && init.method === "POST") {
      inserted = JSON.parse(init.body);
      return new Response("[]", { status: 201 });
    }
    return new Response("[]", { status: 200 });
  });
  const response = await handler(new Request("https://db.example/functions/v1/store-rental-booking", {
    method: "POST",
    headers: { authorization: "Bearer server-only-test-secret", "content-type": "application/json" },
    body: JSON.stringify(body)
  }));
  assert.equal(response.status, 200);
  assert.equal(inserted.file_hash, hash);
  assert.equal("unexpected_admin_field" in inserted, false);
});

test("store endpoint rejects oversized payloads", async () => {
  const handler = loadStoreHandler(async () => { throw new Error("database should not be reached"); });
  const response = await handler(new Request("https://db.example/functions/v1/store-rental-booking", {
    method: "POST",
    headers: { authorization: "Bearer server-only-test-secret", "content-type": "application/json" },
    body: JSON.stringify({ file_hash: hash, notes: "x".repeat(70000) })
  }));
  assert.equal(response.status, 413);
});

test("admin token hash is read from a secret setting instead of source code", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "rental-admin", "index.ts"), "utf8");
  assert.match(source, /Deno\.env\.get\("BOOKING_EDIT_TOKEN_HASH"\)/);
  assert.doesNotMatch(source, /const adminTokenHash\s*=\s*["'][a-f0-9]{64}["']/i);
});

test("bot sends the dedicated server-only token to the protected ingestion function", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "services", "rentalProService.js"), "utf8");
  assert.match(source, /Authorization:\s*`Bearer \$\{rentalProBookingToken\}`/);
  assert.doesNotMatch(source, /headers\.Authorization\s*=\s*`Bearer \$\{publishableKey\}`/);
  assert.doesNotMatch(source, /https:\/\/[^"']+\.supabase\.co\/functions\/v1\/store-rental-booking/);
});

test("administrator API fails closed when the secret hash is not configured", async () => {
  const file = path.join(__dirname, "..", "supabase", "functions", "rental-admin", "index.ts");
  let source = stripTypeScriptTypes(fs.readFileSync(file, "utf8"));
  source = source.replace(/^import\s+["'][^"']+["'];\s*/m, "");
  let handler;
  let databaseCalls = 0;
  const Deno = {
    serve(fn) { handler = fn; },
    env: { get(name) { return ({ SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: "test-key" })[name] || ""; } }
  };
  vm.runInNewContext(source, { Deno, fetch: async () => { databaseCalls++; return new Response("[]"); }, crypto, TextEncoder, Uint8Array, Response, URL, Request, atob, console });
  const response = await handler(new Request("https://db.example/functions/v1/rental-admin/bookings", { method: "GET" }));
  assert.equal(response.status, 403);
  assert.equal(databaseCalls, 0);
});
