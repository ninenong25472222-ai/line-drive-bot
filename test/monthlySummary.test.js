const test = require("node:test");
const assert = require("node:assert/strict");
const summarize = require("../web/assets/monthly-summary.js");
const math = require("../web/assets/booking-calculations.js");

function row(overrides = {}) {
  return {
    pickup_date: "2026-11-10", pickup_time: "08:00", return_date: "2026-11-11", return_time: "08:00",
    customer_name: "ลูกค้าทดสอบ", booking_no: "WEB-TEST", car: "Toyota Yaris", status: "ยืนยันแล้ว",
    daily_rate: 900, delivery_fee: 100, service_total: 1000, booking_deposit: 200, security_deposit: 2000,
    wants_tax_invoice: true, withhold_tax_5: true, deletion_status: "active", ...overrides
  };
}

test("monthly report counts pickup month, preserves archived amounts, and excludes duplicates", () => {
  const report = summarize([
    row(),
    row({ booking_no: "ARCHIVED", customer_name: "เก็บถาวร", daily_rate: 500, delivery_fee: 0, service_total: 500, wants_tax_invoice: false, withhold_tax_5: false, deletion_status: "deleted" }),
    row({ booking_no: "CANCELLED", status: "ยกเลิก", daily_rate: 999, delivery_fee: 0, service_total: 999, deletion_status: "deleted" }),
    row({ booking_no: "DUPLICATE", duplicate_of: "canonical-id" }),
    row({ booking_no: "OTHER-MONTH", pickup_date: "2026-12-01" }),
    row({ booking_no: "NO-DATE", pickup_date: "", _p: "" })
  ], "2026-11", math.calculate);

  assert.equal(report.totals.count, 3);
  assert.equal(report.totals.activeCount, 1);
  assert.equal(report.totals.archivedCount, 2);
  assert.equal(report.totals.cancelledCount, 1);
  assert.equal(report.totals.service, 1000);
  assert.equal(report.totals.archivedService, 500);
  assert.equal(report.totals.cancelledService, 999);
  assert.equal(report.totals.vat, 70);
  assert.equal(report.totals.withholding, 50);
  assert.equal(report.totals.advance, 200);
  assert.equal(report.totals.security, 2000);
  assert.equal(report.totals.due, 2820);
  assert.equal(report.duplicateCount, 1);
  assert.equal(report.missingPickupCount, 1);
  assert.equal(report.cars[0].count, 1);
});

test("monthly report uses stored service total for legacy records without a daily rate", () => {
  const report = summarize([row({ daily_rate: 0, delivery_fee: 100, service_total: 1900 })], "2026-11", math.calculate);
  assert.equal(report.totals.service, 1900);
});
