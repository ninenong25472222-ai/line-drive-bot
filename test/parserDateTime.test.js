const test = require("node:test");
const assert = require("node:assert/strict");

const parseKlook = require("../parsers/klookParser");
const parseChicCar = require("../parsers/chicCarParser");

test("Klook parses date and time when PDF extraction spaces the colon", () => {
    const booking = parseKlook(`
        สถานที่นัดรับ Chic Network - Surat Thani Airport
        เวลานัดรับ 2026-10-07 13 : 00
        สถานที่ส่งคืน Chic Network - Surat Thani Airport
        ข้อมูลการส่งกลับ 2026-10-10 13 : 00
    `);

    assert.equal(booking.pickupDate, "2026-10-07");
    assert.equal(booking.pickupTime, "13:00");
    assert.equal(booking.returnDate, "2026-10-10");
    assert.equal(booking.returnTime, "13:00");
});

test("ChicCar retains matching pickup and return times", () => {
    const booking = parseChicCar(`
        Reservation No. 009990311992
        1 / 1 / 2027 3 / 1 / 2027
        10:00 10:00
    `);

    assert.equal(booking.pickupTime, "10:00");
    assert.equal(booking.returnTime, "10:00");
});

test("ChicCar reads customer names from English and Thai labels without confusing the company name", () => {
    const english = parseChicCar("Customer Name: Nacan Sermsook Telephone: +66950328080 Pick Up 20:00");
    const thai = parseChicCar("บริษัท ChicCar ชื่อผู้เช่า: นาย ณัฐพล ใจดี เบอร์โทรศัพท์: 0950328080 วันรับรถ 20:00");
    const chicCarDriver = parseChicCar("ชื่อผู้ขับขี่ ณัช ภู่วรวรรณ เบอร์โทรติดต่อ 0950328080");
    const companyOnly = parseChicCar("ChicCar Reservation No. 009990311992");
    assert.equal(english.customerName, "Nacan Sermsook");
    assert.equal(thai.customerName, "นาย ณัฐพล ใจดี");
    assert.equal(chicCarDriver.customerName, "ณัช ภู่วรวรรณ");
    assert.equal(companyOnly.customerName, "");
});
