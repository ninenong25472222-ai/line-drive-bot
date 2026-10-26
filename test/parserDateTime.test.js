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
