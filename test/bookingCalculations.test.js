const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const bookingMath = require("../web/assets/booking-calculations.js");

const sample = {
  pickup_date: "2026-11-06", pickup_time: "13:40",
  return_date: "2026-11-08", return_time: "18:40",
  daily_rate: 900, delivery_fee: 0, security_deposit: 2000, booking_deposit: 500
};

test("booking calculation matches the screenshot example exactly", () => {
  const result = bookingMath.calculate(sample);
  assert.equal(result.validDuration, true);
  assert.deepEqual([result.days, result.hours, result.minutes, result.billableDays], [2, 5, 0, 3]);
  assert.equal(result.serviceTotal, 2700);
  assert.equal(result.vat, 0);
  assert.equal(result.withholding, 0);
  assert.equal(result.rentalTotal, 2700);
  assert.equal(result.amountDue, 4200);
});

test("VAT and 5% withholding use service subtotal and exclude the refundable deposit", () => {
  const result = bookingMath.calculate({ ...sample, wants_tax_invoice: true, withhold_tax_5: true });
  assert.equal(result.serviceTotal, 2700);
  assert.equal(result.vat, 189);
  assert.equal(result.withholding, 135);
  assert.equal(result.rentalTotal, 2889);
  assert.equal(result.amountDue, 4254);
});

test("invalid or reversed rental times are not billed as a valid duration", () => {
  assert.equal(bookingMath.calculate({ ...sample, pickup_time: "25:00" }).validDuration, false);
  assert.equal(bookingMath.calculate({ ...sample, return_date: "2026-11-05" }).validDuration, false);
});

test("overpayment is surfaced as credit rather than a negative amount due", () => {
  const result = bookingMath.calculate({ ...sample, booking_deposit: 10000 });
  assert.equal(result.amountDue, -5300);
  assert.equal(result.credit, 5300);
});

test("booking PDF confines payment rows and draws vehicle image without a nested frame", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "booking-workspace.js"), "utf8");
  const section = source.slice(source.indexOf("async function bookingTemplateCanvas"), source.indexOf("function canvasPdfBlob"));
  assert.match(section, /ctx\.rect\(x \+ 14, rowY - 2, mid - x - 28, 25\); ctx\.clip\(\)/);
  assert.match(section, /clippedContain\(carPhoto, photoX, photoY, photoW, photoH\)/);
  assert.doesNotMatch(section, /box\(photoX/);
  assert.match(section, /window\.RentalBookingMath\.calculate\(data\)/);
});
