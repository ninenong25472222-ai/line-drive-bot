const test = require("node:test");
const assert = require("node:assert/strict");

const {
    bookingIdFromPath,
    configuredEmails
} = require("../netlify/functions/booking");

test("extracts a booking id from the Netlify function route", () => {
    assert.equal(
        bookingIdFromPath("/.netlify/functions/booking/a%20booking"),
        "a booking"
    );
    assert.equal(bookingIdFromPath("/api/bookings/"), "");
});

test("normalizes the dashboard editor allow-list", () => {
    const before = process.env.DASHBOARD_ALLOWED_EMAILS;
    process.env.DASHBOARD_ALLOWED_EMAILS = " Admin@Example.com , second@example.com ";

    try {
        const emails = configuredEmails();
        assert.equal(emails.has("admin@example.com"), true);
        assert.equal(emails.has("second@example.com"), true);
    } finally {
        if (before === undefined) delete process.env.DASHBOARD_ALLOWED_EMAILS;
        else process.env.DASHBOARD_ALLOWED_EMAILS = before;
    }
});
