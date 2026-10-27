const test = require("node:test");
const assert = require("node:assert/strict");
const { bookingInput, overlapsBooking } = require("../netlify/functions/bookings");
const { carPatch, carIdFromPath } = require("../netlify/functions/cars");

test("booking creation keeps AppSheet money and date/time fields", () => {
  const booking = bookingInput({
    car_id: "car-1", customer_name: "ลูกค้า", pickup_date: "2026-10-30", pickup_time: "08:15",
    return_date: "2026-10-31", return_time: "17:40", daily_rate: "900", booking_deposit: "500",
    security_deposit: "2000", delivery_fee: "100", service_total: "1900", wants_tax_invoice: true,
  });
  assert.equal(booking.daily_rate, 900);
  assert.equal(booking.booking_deposit, 500);
  assert.equal(booking.wants_tax_invoice, true);
  assert.equal(booking.return_time, "17:40");
});

test("booking conflict check compares dates and times, not only dates", () => {
  const existing = { pickup_date: "2026-10-30", pickup_time: "10:00", return_date: "2026-10-30", return_time: "12:00" };
  assert.equal(overlapsBooking({ pickup_date: "2026-10-30", pickup_time: "09:30", return_date: "2026-10-30", return_time: "10:30" }, existing), true);
  assert.equal(overlapsBooking({ pickup_date: "2026-10-30", pickup_time: "12:00", return_date: "2026-10-30", return_time: "13:00" }, existing), false);
});

test("car API accepts only known editable fields", () => {
  assert.deepEqual(carPatch({ car_ref: "ไลออน", model: "Yaris", status: "ว่าง", unknown: "ignore", default_daily_rate: "900" }), { car_ref: "ไลออน", model: "Yaris", status: "ว่าง", default_daily_rate: 900 });
  assert.equal(carIdFromPath("/.netlify/functions/cars/abc-123"), "abc-123");
});
