const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadBookingsHandler(fetchMock) {
    const source = fs.readFileSync(require.resolve("../functions/api/bookings.js"), "utf8")
        .replace(/^import .*;\r?\n/, "")
        .replace("export async function onRequest", "async function onRequest") +
        "\nglobalThis.onRequest = onRequest;";
    const context = {
        URLSearchParams,
        Response,
        fetch: fetchMock,
        adminToken: (request) => request.headers.get("x-booking-edit-token") || "",
        forward: async (response) => new Response(await response.text(), { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json" } }),
        headers: (_anonKey, extra = {}) => extra,
        json: (body, status = 200) => Response.json(body, { status }),
        options: () => new Response(null, { status: 204 }),
        settings: () => ({ url: "https://example.supabase.co", anonKey: "public-test-key" }),
    };
    vm.runInNewContext(source, context);
    return context.onRequest;
}

test("Cloudflare bookings endpoint proxies private data through the PIN-protected administrator function", async () => {
    const requests = [];
    const handler = loadBookingsHandler(async (url, init) => {
        requests.push({ url: new URL(url), init });
        return Response.json([{ id: "booking-1", customer_name: "Private customer" }]);
    });

    const response = await handler({ request: new Request("https://app.example/api/bookings", { headers: { "x-booking-edit-token": "test-pin" } }) });
    const rows = await response.json();

    assert.equal(response.status, 200);
    assert.equal(rows.length, 1);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url.pathname, "/functions/v1/rental-admin/bookings");
    assert.equal(requests[0].init.headers["x-booking-edit-token"], "test-pin");
});

test("Cloudflare bookings endpoint rejects unauthenticated reads without calling Supabase", async () => {
    let called = false;
    const handler = loadBookingsHandler(async () => { called = true; return Response.json([]); });

    const response = await handler({ request: new Request("https://app.example/api/bookings") });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error, "กรอกรหัสผู้ดูแลเพื่อดูข้อมูล");
    assert.equal(called, false);
});

test("Cloudflare bookings endpoint forwards administrator authorization failures", async () => {
    const handler = loadBookingsHandler(async () => Response.json({ error: "รหัสผู้ดูแลไม่ถูกต้อง" }, { status: 403 }));

    const response = await handler({ request: new Request("https://app.example/api/bookings", { headers: { "x-booking-edit-token": "wrong-pin" } }) });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error, "รหัสผู้ดูแลไม่ถูกต้อง");
});
