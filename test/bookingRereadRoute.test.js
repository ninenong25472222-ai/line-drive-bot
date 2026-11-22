const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadHandler(fetchMock) {
  const file = require.resolve("../functions/api/bookings/[id]/reread.js");
  const source = fs.readFileSync(file, "utf8").replace(/^import .*;\r?\n/gm, "").replace("export async function onRequest", "async function onRequest") + "\nglobalThis.onRequest = onRequest;";
  const context = {
    URL, Response, AbortSignal, fetch: fetchMock,
    adminToken: (request) => request.headers.get("x-booking-edit-token") || "",
    json: (body, status = 200) => Response.json(body, { status }),
    options: () => new Response(null, { status: 204 }),
  };
  vm.runInNewContext(source, context);
  return context.onRequest;
}

test("booking reread proxy requires the admin PIN before contacting Render", async () => {
  let called = false;
  const handler = loadHandler(async () => { called = true; return Response.json({}); });
  const id = "11111111-1111-4111-8111-111111111111";
  const response = await handler({ request: new Request(`https://app.example/api/bookings/${id}/reread`, { method: "POST" }), params: { id }, env: {} });
  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test("booking reread proxy forwards the admin PIN and parsed schedule to the bot service", async () => {
  let calledUrl = "", calledInit;
  const handler = loadHandler(async (url, init) => {
    calledUrl = url; calledInit = init;
    return Response.json({ pickup_date: "2026-11-21", pickup_time: "08:00", return_date: "2026-11-22", return_time: "08:00", foundCount: 4 });
  });
  const id = "11111111-1111-4111-8111-111111111111";
  const response = await handler({
    request: new Request(`https://app.example/api/bookings/${id}/reread`, { method: "POST", headers: { "x-booking-edit-token": "staff-pin" } }),
    params: { id }, env: { RENTAL_BOT_URL: "https://bot.example/" },
  });
  assert.equal(response.status, 200);
  assert.equal(calledUrl, `https://bot.example/admin/bookings/${id}/read`);
  assert.equal(calledInit.headers["x-booking-edit-token"], "staff-pin");
  assert.equal((await response.json()).foundCount, 4);
});

test("booking reread proxy preserves the useful error message from the bot", async () => {
  const handler = loadHandler(async () => Response.json({ error: "ไม่พบวันหรือเวลาเช่า" }, { status: 422 }));
  const id = "11111111-1111-4111-8111-111111111111";
  const response = await handler({ request: new Request(`https://app.example/api/bookings/${id}/reread`, { method: "POST", headers: { "x-booking-edit-token": "staff-pin" } }), params: { id }, env: {} });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error, "ไม่พบวันหรือเวลาเช่า");
});

test("booking reread proxy converts a non-JSON Render error page into an actionable JSON error", async () => {
  const handler = loadHandler(async () => new Response("<html>Too Many Requests</html>", {
    status: 429, headers: { "content-type": "text/html" },
  }));
  const id = "11111111-1111-4111-8111-111111111111";
  const response = await handler({ request: new Request(`https://app.example/api/bookings/${id}/reread`, { method: "POST", headers: { "x-booking-edit-token": "staff-pin" } }), params: { id }, env: {} });
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /รอประมาณ 1 นาที/);
});

test("booking reread proxy labels successful but invalid upstream payloads as gateway errors", async () => {
  const handler = loadHandler(async () => new Response("<html>Bad gateway</html>", {
    status: 200, headers: { "content-type": "text/html" },
  }));
  const id = "11111111-1111-4111-8111-111111111111";
  const response = await handler({ request: new Request(`https://app.example/api/bookings/${id}/reread`, { method: "POST", headers: { "x-booking-edit-token": "staff-pin" } }), params: { id }, env: {} });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /HTTP 200/);
});
