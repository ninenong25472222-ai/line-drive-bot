const Booking = require("../models/booking");

function parseTrip(text) {

    text = text
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n");

    const booking = Booking();

    booking.company = "Trip";
    booking.rawText = text;

    // -----------------------------
    // Booking Number
    // -----------------------------
    let m =
        text.match(/Booking no\.?:\s*([A-Z0-9]+)/i) ||
        text.match(/Booking\s*No\.?\s*([A-Z0-9]+)/i) ||
        text.match(/หมายเลขการจอง[: ]*([A-Z0-9]+)/i);

    if (m) {
        booking.bookingNo = m[1].trim();
    }

    // -----------------------------
    // Customer
    // -----------------------------
    m =
        text.match(/Main Driver Name\s*\n([^\n]+)/i) ||
        text.match(/ชื่อผู้ขับขี่หลัก\s*\n([\s\S]*?)\n(?:หมายเลขเวาเชอร์รับรถ|รายละเอียดรถ)/i);

    if (m) {

        booking.customerName = m[1]
            .replace(/\n/g, " ")
            .replace(/\s+/g, " ")
            .trim();

    }

    booking.renter = booking.customerName;

    // -----------------------------
    // Car
    // -----------------------------
    m =
        text.match(/Car type\s*([^\n]*?)(?:Transmission|Seats)/i) ||
        text.match(/ประเภทรถ([\s\S]*?)ระบบเกียร์/i);

    if (m) {

        booking.car = m[1]
            .replace(/\n/g, " ")
            .replace(/or similar/i, "")
            .replace(/หรือรุ่น.*$/i, "")
            .replace(/\s+/g, " ")
            .trim();

    }

    // -----------------------------
    // Phone
    // -----------------------------
    m = text.match(/\+66[- ]?\d[\d -]{7,}/);

    if (!m) {
        m = text.match(/0\d{9}/);
    }

    if (m) {
        booking.customerPhone = m[0].replace(/[ -]/g, "");
    }

    // -----------------------------
    // Pickup (English)
    // -----------------------------
    m = text.match(/Pick-up([\s\S]*?)Drop-off/i);

    if (m) {

        const section = m[1];

        const airport = section.match(/([A-Za-z ]+Airport)/i);

        if (airport)
            booking.pickupLocation = airport[1].trim();

        const dt = section.match(
            /(\d{1,2}:\d{2}\s*(?:AM|PM)),?\s*([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/i
        );

        if (dt) {

            booking.pickupTime = dt[1];

            booking.pickupDate = dt[2];

        }

    }

    // -----------------------------
    // Pickup (Thai)
    // -----------------------------
    if (!booking.pickupDate) {

        m = text.match(
            /จุดรับรถ([\s\S]*?)จุดคืนรถ/i
        );

        if (m) {

            const section = m[1];

            const loc = section.match(/^([^\n]+)/m);

            if (loc)
                booking.pickupLocation = loc[1].trim();

            const date = section.match(
                /(\d{1,2}\s+[ก-๙]+\s+\d{4})/
            );

            if (date)
                booking.pickupDate = date[1];

            const time = section.match(
                /(\d{1,2}:\d{2})/
            );

            if (time)
                booking.pickupTime = time[1];

        }

    }

    // -----------------------------
    // Return (English)
    // -----------------------------
    m = text.match(/Drop-off([\s\S]*)$/i);

    if (m) {

        const section = m[1];

        const airport = section.match(/([A-Za-z ]+Airport)/i);

        if (airport)
            booking.returnLocation = airport[1].trim();

        const dt = section.match(
            /(\d{1,2}:\d{2}\s*(?:AM|PM)),?\s*([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/i
        );

        if (dt) {

            booking.returnTime = dt[1];

            booking.returnDate = dt[2];

        }

    }

    // -----------------------------
    // Return (Thai)
    // -----------------------------
    if (!booking.returnDate) {

        m = text.match(
            /จุดคืนรถ([\s\S]*)$/i
        );

        if (m) {

            const section = m[1];

            const loc = section.match(/^([^\n]+)/m);

            if (loc)
                booking.returnLocation = loc[1].trim();

            const date = section.match(
                /(\d{1,2}\s+[ก-๙]+\s+\d{4})/
            );

            if (date)
                booking.returnDate = date[1];

            const time = section.match(
                /(\d{1,2}:\d{2})/
            );

            if (time)
                booking.returnTime = time[1];

        }

    }

    return booking;
}

module.exports = parseTrip;