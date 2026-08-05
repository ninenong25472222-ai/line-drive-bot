const Booking = require("../models/booking");

function parseTrip(text) {

    text = text
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n");

    const booking = Booking();

    booking.company = "Trip";
    booking.rawText = text;

    // -------------------------
    // Booking Number
    // -------------------------

    let m =
        text.match(/Booking\s*no\.?\s*[: ]?\s*([A-Z0-9]+)/i) ||
        text.match(/Booking\s*No\.?\s*[: ]?\s*([A-Z0-9]+)/i) ||
        text.match(/หมายเลขการจอง[: ]*\s*([0-9]+)/);

    if (m)
        booking.bookingNo = m[1].trim();

    // -------------------------
    // Customer
    // -------------------------

    m =
        text.match(/Main Driver Name\s*\n([^\n]+)/i) ||
        text.match(/ชื่อผู้ขับขี่หลัก\s*\n([^\n]+)/);

    if (m)
        booking.customerName = m[1].trim();

    booking.renter = booking.customerName;

    // -------------------------
    // Phone
    // -------------------------

    m = text.match(/\+66[- ]?\d[\d -]{7,}/);

    if (m)
        booking.customerPhone =
            m[0].replace(/[ -]/g, "");

    // -------------------------
    // Car (English)
    // -------------------------

    m = text.match(
        /Car type\s*([^\n]*?)(?:Transmission|Seats)/i
    );

    if (m) {

        booking.car = m[1]
            .replace(/or similar/i, "")
            .replace(/\s+/g, " ")
            .trim();

    }

    // -------------------------
    // Car (Thai)
    // -------------------------

    if (!booking.car) {

        m = text.match(
            /ประเภทรถ([\s\S]{0,120})ระบบเกียร์/
        );

        if (m) {

            booking.car = m[1]
                .replace(/หรือรุ่นที่ใกล้เคียง/g, "")
                .replace(/\n/g, " ")
                .replace(/\s+/g, " ")
                .trim();

        }

    }

    // -------------------------
    // Airport
    // -------------------------

    const airports = text.match(
        /([A-Za-z ]+Airport)/g
    );

    if (airports) {

        booking.pickupLocation = airports[0];

        if (airports.length > 1)
            booking.returnLocation = airports[1];
        else
            booking.returnLocation = airports[0];

    }

    // -------------------------
    // English Date
    // -------------------------

    const englishDates = [
        ...text.matchAll(
            /(\d{1,2}:\d{2}\s*(?:AM|PM)),?\s*([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/gi
        )
    ];

    if (englishDates.length >= 2) {

        booking.pickupTime = englishDates[0][1];

        booking.pickupDate = englishDates[0][2];

        booking.returnTime = englishDates[1][1];

        booking.returnDate = englishDates[1][2];

    }

    // -------------------------
    // Thai Date
    // -------------------------

    if (!booking.pickupDate) {

        const thaiDates = [
            ...text.matchAll(
                /(\d{1,2}\s*[ก-๙A-Za-z\.]+\s*\d{4})\s*(\d{1,2}:\d{2})/g
            )
        ];

        if (thaiDates.length >= 2) {

            booking.pickupDate = thaiDates[0][1];
            booking.pickupTime = thaiDates[0][2];

            booking.returnDate = thaiDates[1][1];
            booking.returnTime = thaiDates[1][2];

        }

    }

    // -------------------------
    // Thai Date (เพี้ยน)
    // เช่น
    // 1 ส.ค. 2026 08:30 น.
    // -------------------------

    if (!booking.pickupDate) {

        const matches = [
            ...text.matchAll(
                /(\d{1,2}\s*ส\.[ก-ฮ]+\.\s*\d{4})\s*(\d{1,2}:\d{2})/g
            )
        ];

        if (matches.length >= 2) {

            booking.pickupDate = matches[0][1];
            booking.pickupTime = matches[0][2];

            booking.returnDate = matches[1][1];
            booking.returnTime = matches[1][2];

        }

    }

    // -------------------------
    // Fallback หาเวลาอย่างเดียว
    // -------------------------

    if (!booking.pickupTime) {

        const times =
            text.match(/\d{1,2}:\d{2}\s*(?:AM|PM|น\.)?/g);

        if (times && times.length >= 2) {

            booking.pickupTime = times[0];

            booking.returnTime = times[1];

        }

    }

    return booking;

}

module.exports = parseTrip;