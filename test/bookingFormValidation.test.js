const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../web/booking-workspace.js"), "utf8");
const start = source.indexOf("function validateBookingForm(form) {");
assert.notEqual(start, -1, "booking form validator should exist");
let depth = 0;
let end = -1;
for (let i = source.indexOf("{", start); i < source.length; i++) {
  if (source[i] === "{") depth++;
  if (source[i] === "}" && --depth === 0) { end = i + 1; break; }
}
assert.notEqual(end, -1, "booking form validator should be complete");
const validate = new Function("window", `return (${source.slice(start, end)})`)(
  { RentalBookingMath: { calculate: () => ({ validDuration: true }) } },
);

function field(value = "") { return { value, checked: false }; }
function validForm() {
  return { elements: {
    booking_channel: field("LINE OA"), customer_name: field("Test Customer"), customer_phone: field("0812345678"),
    customer_email: field(""), car_id: field("car-1"), pickup_date: field("2026-11-19"), pickup_time: field("10:50"),
    return_date: field("2026-11-22"), return_time: field("11:00"), pickup_location: field("Airport"), return_location: field("Airport"),
    edit_token: field("123456"), daily_rate: field("800"), booking_deposit: field("0"), security_deposit: field("2000"),
    delivery_fee: field("0"), wants_tax_invoice: field(), tax_company_name: field(""),
  } };
}

test("booking form accepts a PIN and valid schedule without browser pattern validation", () => {
  assert.equal(validate(validForm()), null);
  assert.match(source, /id="bookingForm" novalidate/);
});

test("booking form explains malformed optional email in Thai", () => {
  const form = validForm();
  form.elements.customer_email.value = "not-an-email";
  const error = validate(form);
  assert.equal(error.field, form.elements.customer_email);
  assert.match(error.message, /อีเมลไม่ถูกต้อง/);
});

test("booking form reports missing data and invalid rental duration clearly", () => {
  const form = validForm();
  form.elements.customer_name.value = " ";
  assert.equal(validate(form).message, "กรอกชื่อลูกค้า");
  form.elements.customer_name.value = "Test Customer";
  const invalidDuration = new Function("window", `return (${source.slice(start, end)})`)({
    RentalBookingMath: { calculate: () => ({ validDuration: false }) },
  });
  assert.equal(invalidDuration(form).message, "วันและเวลาคืนรถต้องอยู่หลังวันและเวลาส่งรถ");
});
