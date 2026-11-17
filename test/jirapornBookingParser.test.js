const test = require("node:test");
const assert = require("node:assert/strict");
const detectCompany = require("../utils/detectCompany");
const parseJirapornBooking = require("../parsers/jirapornBookingParser");
const parserService = require("../services/parserService");

const sample = `
ห้างหุ้นส่วนจำกัด จิราพร คาร์เร้นท์ ( JIRAPORNCARRET )
เลขที่การใบจอง AB-20261030-4EF3
ข้อมูลลูกค้า : ตัวอย่างลูกค้า จำนวนวัน ชั่วโมง นาที
เบอร์โทรติดต่อ : 0812345678
Pick Up / รับรถ DD / MM / YYYY
วันที่ : 30/10/2569 เวลา: 21:50 น. สถานที่รับ: สนามบินสุราษฎร์ธานี
Return / คืนรถ DD / MM / YYYY
วันที่ : 31/10/2569 เวลา: 21:50 น. สถานที่คืน: สนามบินสุราษฎร์ธานี
รายละเอียดรถเช่า
Toyota Yaris Ativ 2025
คำขอพิเศษ: ตัวอย่าง
`;

test("recognizes and parses the Jiraporn booking confirmation with Buddhist dates", () => {
  assert.equal(detectCompany(sample), "jiraporn");
  const booking = parseJirapornBooking(sample);
  assert.equal(booking.bookingNo, "AB-20261030-4EF3");
  assert.equal(booking.customerPhone, "0812345678");
  assert.equal(booking.pickupDate, "2026-10-30");
  assert.equal(booking.pickupTime, "21:50");
  assert.equal(booking.pickupLocation, "สนามบินสุราษฎร์ธานี");
  assert.equal(booking.returnDate, "2026-10-31");
  assert.equal(booking.returnTime, "21:50");
  assert.equal(booking.returnLocation, "สนามบินสุราษฎร์ธานี");
  assert.match(booking.car, /Toyota Yaris Ativ 2025/);
  assert.equal(booking.company, "Jiraporn");
});

test("parser service routes the Jiraporn format to its own parser", () => {
  const booking = parserService.parse(sample);
  assert.equal(booking.company, "Jiraporn");
  assert.equal(booking.pickupDate, "2026-10-30");
  assert.equal(booking.returnDate, "2026-10-31");
});

test("Jiraporn date parser rejects impossible dates instead of inventing a replacement", () => {
  const booking = parseJirapornBooking(sample.replace("30/10/2569", "31/02/2569"));
  assert.equal(booking.pickupDate, "");
});
