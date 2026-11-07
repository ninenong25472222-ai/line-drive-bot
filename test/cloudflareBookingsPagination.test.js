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
        adminToken: () => "",
        forward: (response) => response,
        headers: () => ({}),
        json: (body, status = 200) => Response.json(body, { status }),
        options: () => new Response(null, { status: 204 }),
        settings: () => ({ url: "https://example.supabase.co", anonKey: "public-test-key" }),
    };
    vm.runInNewContext(source, context);
    return context.onRequest;
}

test("Cloudflare bookings endpoint loads every page beyond the first 500 rows", async () => {
    const requests = [];
    const handler = loadBookingsHandler(async (url) => {
        requests.push(new URL(url));
        const offset = Number(new URL(url).searchParams.get("offset"));
        const rows = offset === 0
            ? Array.from({ length: 500 }, (_, index) => ({ id: index }))
            : [{ id: 500 }];
        return Response.json(rows);
    });

    const response = await handler({ request: new Request("https://app.example/api/bookings") });
    const rows = await response.json();

    assert.equal(response.status, 200);
    assert.equal(rows.length, 501);
    assert.deepEqual(requests.map((url) => url.searchParams.get("offset")), ["0", "500"]);
});

test("Cloudflare bookings endpoint reports an upstream error without returning partial rows", async () => {
    const handler = loadBookingsHandler(async () => new Response("database unavailable", { status: 503 }));

    const response = await handler({ request: new Request("https://app.example/api/bookings") });
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.error, "โหลดรายการจองไม่สำเร็จ");
    assert.equal(body.upstream_status, 503);
});
