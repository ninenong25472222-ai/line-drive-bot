const test = require("node:test");
const assert = require("node:assert/strict");

const { handler } = require("../netlify/functions/bookings");

test("does not use a Supabase service-role key for the public endpoint", async () => {
    const originalUrl = process.env.SUPABASE_URL;
    const originalAnonKey = process.env.SUPABASE_ANON_KEY;
    const originalServiceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "must-not-be-used";

    try {
        const response = await handler({ httpMethod: "GET" });

        assert.equal(response.statusCode, 503);
        assert.match(response.body, /Dashboard access is not configured/);
    } finally {
        if (originalUrl === undefined) delete process.env.SUPABASE_URL;
        else process.env.SUPABASE_URL = originalUrl;
        if (originalAnonKey === undefined) delete process.env.SUPABASE_ANON_KEY;
        else process.env.SUPABASE_ANON_KEY = originalAnonKey;
        if (originalServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }
});
