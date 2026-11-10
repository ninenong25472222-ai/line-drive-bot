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
  vm.runInNewContext(source, { Deno, fetch: fetchMock, crypto, TextEncoder, Uint8Array, Response, URL, URLSearchParams, Request, atob, console });
  return handler;
}

function bookingRow(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111", deletion_status: "active", status: "ยืนยันแล้ว",
    car_id: "car-1", pickup_date: "2026-11-07", pickup_time: "09:00",
    return_date: "2026-11-09", return_time: "09:00", daily_rate: 900,
    delivery_fee: 100, booking_deposit: 500, security_deposit: 2000,
    service_total: 1900, wants_tax_invoice: false, tax_company_name: "", withhold_tax_5: false,
    ...overrides
  };
}

function mockResponse(value) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

test("editing a booking saves its custom rate and recalculates service total from its own duration", async () => {
  let row = bookingRow();
  const handler = loadAdminHandler(async (url, init = {}) => {
    if (init.method === "PATCH") { row = { ...row, ...JSON.parse(init.body) }; return mockResponse([row]); }
    return mockResponse([row]);
  });
  const response = await handler(new Request(`https://db.example/functions/v1/rental-admin/bookings/${row.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ daily_rate: "1,200".replace(",", ""), delivery_fee: "150", booking_deposit: "700", security_deposit: "2500", wants_tax_invoice: true, tax_company_name: "บริษัททดสอบ จำกัด", withhold_tax_5: true })
  }));
  assert.equal(response.status, 200);
  assert.equal(row.daily_rate, 1200);
  assert.equal(row.delivery_fee, 150);
  assert.equal(row.service_total, 2550);
  assert.equal(row.booking_deposit, 700);
  assert.equal(row.security_deposit, 2500);
  assert.equal(row.wants_tax_invoice, true);
  assert.equal(row.tax_company_name, "บริษัททดสอบ จำกัด");
  assert.equal(row.withhold_tax_5, true);
});

test("date/time edits on an assigned car are checked for overlapping reservations", async () => {
  const row = bookingRow();
  let patchCount = 0;
  const conflict = { id: "22222222-2222-4222-8222-222222222222", pickup_date: "2026-11-10", pickup_time: "10:00", return_date: "2026-11-10", return_time: "12:00", booking_no: "EXISTING" };
  const handler = loadAdminHandler(async (url, init = {}) => {
    const address = String(url);
    if (init.method === "PATCH") { patchCount++; return mockResponse([row]); }
    if (address.includes("rental_cars")) return mockResponse([{ id: "car-1", active: true, status: "ว่าง", model: "Yaris", car_ref: "A1" }]);
    if (address.includes("rental_bookings") && address.includes("car_id=eq.")) return mockResponse([conflict]);
    return mockResponse([row]);
  });
  const response = await handler(new Request(`https://db.example/functions/v1/rental-admin/bookings/${row.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ pickup_date: "2026-11-10", pickup_time: "11:00", return_date: "2026-11-10", return_time: "13:00" })
  }));
  assert.equal(response.status, 409);
  assert.equal(patchCount, 0);
});

test("invalid calendar dates are rejected by the rental administrator API", async () => {
  const handler = loadAdminHandler(async () => mockResponse([]));
  const response = await handler(new Request("https://db.example/functions/v1/rental-admin/bookings", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ car_id: "car-1", customer_name: "Test", pickup_date: "2026-02-31", pickup_time: "09:00", return_date: "2026-03-01", return_time: "09:00", daily_rate: 100 })
  }));
  assert.equal(response.status, 400);
});

test("administrator booking list paginates past 500 rows after PIN authorization", async () => {
  const requests = [];
  const handler = loadAdminHandler(async (url) => {
    const address = new URL(String(url));
    requests.push(address);
    const offset = Number(address.searchParams.get("offset"));
    const rows = offset === 0
      ? Array.from({ length: 500 }, (_, index) => ({ id: `booking-${index}` }))
      : Array.from({ length: 3 }, (_, index) => ({ id: `booking-${500 + index}` }));
    return mockResponse(rows);
  });
  const response = await handler(new Request("https://db.example/functions/v1/rental-admin/bookings", { method: "GET" }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.length, 503);
  assert.deepEqual(requests.map((url) => url.searchParams.get("offset")), ["0", "500"]);
  assert.ok(requests.every((url) => url.searchParams.get("select").includes("customer_phone")));
});

test("administrator reparse fills only valid missing dates and times", async () => {
  let row = bookingRow({ pickup_date: "", pickup_time: "", return_date: "2026-11-09", return_time: "09:00" });
  let patchBody;
  const handler = loadAdminHandler(async (_url, init = {}) => {
    if (init.method === "PATCH") { patchBody = JSON.parse(init.body); row = { ...row, ...patchBody }; return mockResponse([row]); }
    return mockResponse([row]);
  });
  const response = await handler(new Request(`https://db.example/functions/v1/rental-admin/bookings/${row.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ reparse_only: true, pickup_date: "2026-11-07", pickup_time: "08:30", return_date: "2026-11-10", return_time: "not-a-time" })
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.updatedFields, ["pickup_date", "pickup_time"]);
  assert.deepEqual(Object.keys(patchBody).sort(), ["pickup_date", "pickup_time", "updated_at"]);
  assert.equal(row.return_date, "2026-11-09");
  assert.equal(row.return_time, "09:00");
});

test("administrator file-link route returns only a validated Drive link", async () => {
  const row = bookingRow({ drive_url: "https://drive.google.com/file/d/drive-id-123/view", file_name: "booking.pdf" });
  const handler = loadAdminHandler(async () => mockResponse([row]));
  const response = await handler(new Request(`https://db.example/functions/v1/rental-admin/bookings/${row.id}/file?download=1`, { method: "GET" }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body).sort(), ["booking_no", "file_name", "url"]);
  assert.equal(body.url, "https://drive.google.com/uc?export=download&id=drive-id-123");
  assert.equal(body.file_name, "booking.pdf");
});

test("manual booking keeps the entered rate and calculates its stored total on the server", async () => {
  let savedBooking;
  const handler = loadAdminHandler(async (url, init = {}) => {
    const address = String(url);
    if (init.method === "POST" && address.endsWith("/rental_bookings")) {
      savedBooking = JSON.parse(init.body);
      return mockResponse([savedBooking]);
    }
    if (address.includes("rental_cars")) return mockResponse([{ id: "car-1", active: true, status: "ว่าง", model: "Yaris", car_ref: "A1" }]);
    return mockResponse([]);
  });
  const response = await handler(new Request("https://db.example/functions/v1/rental-admin/bookings", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ car_id: "car-1", customer_name: "Test", pickup_date: "2026-11-07", pickup_time: "09:00", return_date: "2026-11-08", return_time: "11:00", daily_rate: 1234.56, delivery_fee: 55.55, booking_deposit: 400, security_deposit: 2000, service_total: 1 })
  }));
  assert.equal(response.status, 201);
  assert.equal(savedBooking.daily_rate, 1234.56);
  assert.equal(savedBooking.service_total, 2524.67);
});

test("operational status flow requires a cancellation reason, records history, and can restore the booking", async () => {
  let row = bookingRow({ rental_status: "scheduled", rental_status_history: [] });
  const handler = loadAdminHandler(async (url, init = {}) => {
    if (init.method === "PATCH") { row = { ...row, ...JSON.parse(init.body) }; return mockResponse([row]); }
    if (String(url).includes("car_id=eq.")) return mockResponse([]);
    return mockResponse([row]);
  });
  const call = (payload) => handler(new Request(`https://db.example/functions/v1/rental-admin/bookings/${row.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
  }));

  const missingReason = await call({ rental_status_action: "cancel_booking" });
  assert.equal(missingReason.status, 400);
  assert.equal(row.rental_status, "scheduled");

  const cancelledResponse = await call({ rental_status_action: "cancel_booking", cancellation_reason: "ลูกค้าขอยกเลิก" });
  assert.equal(cancelledResponse.status, 200);
  assert.equal(row.rental_status, "cancelled");
  assert.equal(row.status, "ยกเลิก");
  assert.equal(row.status_before_cancel, "ยืนยันแล้ว");
  assert.equal(row.cancellation_reason, "ลูกค้าขอยกเลิก");
  assert.equal(row.rental_status_history.at(-1).to, "cancelled");

  const reopenedResponse = await call({ rental_status_action: "reopen_booking" });
  assert.equal(reopenedResponse.status, 200);
  assert.equal(row.rental_status, "scheduled");
  assert.equal(row.status, "ยืนยันแล้ว");
  assert.equal(row.rental_status_history.length, 2);
});

test("delivery and return status changes must happen in order", async () => {
  let row = bookingRow({ rental_status: "scheduled", rental_status_history: [] });
  const handler = loadAdminHandler(async (_url, init = {}) => {
    if (init.method === "PATCH") { row = { ...row, ...JSON.parse(init.body) }; return mockResponse([row]); }
    return mockResponse([row]);
  });
  const call = (payload) => handler(new Request(`https://db.example/functions/v1/rental-admin/bookings/${row.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
  }));
  assert.equal((await call({ rental_status_action: "mark_returned" })).status, 409);
  assert.equal((await call({ rental_status_action: "mark_delivered" })).status, 200);
  assert.equal(row.rental_status, "delivered");
  assert.ok(row.delivered_at);
  assert.equal((await call({ rental_status_action: "mark_returned" })).status, 200);
  assert.equal(row.rental_status, "returned");
  assert.ok(row.returned_at);
});

test("cancelled booking cannot be restored into an overlapping vehicle reservation", async () => {
  const row = bookingRow({ status: "ยกเลิก", rental_status: "cancelled", status_before_cancel: "ยืนยันแล้ว", pickup_on: "2026-11-07", return_on: "2026-11-09" });
  const conflict = { id: "22222222-2222-4222-8222-222222222222", pickup_date: "2026-11-08", pickup_time: "09:00", return_date: "2026-11-10", return_time: "09:00", booking_no: "OTHER" };
  let patchCount = 0;
  const handler = loadAdminHandler(async (url, init = {}) => {
    const address = String(url);
    if (init.method === "PATCH") { patchCount++; return mockResponse([{ ...row, ...JSON.parse(init.body) }]); }
    if (address.includes("car_id=eq.")) return mockResponse([conflict]);
    return mockResponse([row]);
  });
  const response = await handler(new Request(`https://db.example/functions/v1/rental-admin/bookings/${row.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ rental_status_action: "reopen_booking" })
  }));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.match(body.error, /มีรายการจองซ้อน/);
  assert.equal(patchCount, 0);
});
