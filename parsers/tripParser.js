const Booking = require("../models/booking");

function parseTrip(text) {

    text = text
        .replace(/\r/g, "")
        .replace(/\u0000/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n");

    const booking = Booking();

    booking.company = "Trip";
    booking.rawText = text;

    // ---------------- Booking No ----------------

    let m =
        text.match(/Booking no\.?\s*:?\s*([A-Z0-9]+)/i) ||
        text.match(/หมายเลขการจอง\s*:?\s*([A-Z0-9]+)/i);

    if (m) {
        booking.bookingNo = m[1].trim();
    }

    // ---------------- Phone ----------------

    m = text.match(/\+66[- ]?\d[\d -]{7,}/);

    if (m) {
        booking.customerPhone = m[0].replace(/[ -]/g, "");
    }

    // ---------------- Customer ----------------

    const lines = text
        .split("\n")
        .map(x => x.trim())
        .filter(Boolean);

    for (let i = 0; i < lines.length - 1; i++) {

        // ภาษาอังกฤษ
        if (
            /^[A-Z]+$/.test(lines[i]) &&
            /^[A-Z]+$/.test(lines[i + 1])
        ) {

            const fullname = `${lines[i]} ${lines[i + 1]}`;

            if (
                fullname.length > 5 &&
                !fullname.includes("AIRPORT") &&
                !fullname.includes("BOOKING")
            ) {
                booking.customerName = fullname;
                booking.renter = fullname;
                break;
            }
        }

        // ภาษาอังกฤษแบบบรรทัดเดียว
        if (/^[A-Z ]{6,}$/.test(lines[i])) {

            if (
                !lines[i].includes("AIRPORT") &&
                !lines[i].includes("BOOKING")
            ) {

                booking.customerName = lines[i];
                booking.renter = lines[i];
                break;
            }
        }

    }

    // ---------------- Car ----------------

    m =
        text.match(/Car type\s*([\s\S]*?)Transmission/i) ||
        text.match(/ประเภทรถ([\s\S]*?)ระบบเกียร์/i);

    if (m) {

        booking.car = m[1]
            .replace(/or similar/i, "")
            .replace(/หรือรุ่นที.*/i, "")
            .replace(/[\u0000]/g, "")
            .replace(/\n/g, " ")
            .replace(/\s+/g, " ")
            .replace("มิตซูบิช ิ", "มิตซูบิชิ")
            .trim();

    }

    // ---------------- Pickup ----------------

    m =
        text.match(/Pick-up([\s\S]*?)Drop-off/i) ||
        text.match(/จุดรับรถ([\s\S]*?)จุดคืนรถ/i);

    if (m) {

        const sec = m[1];

        let airport = sec.match(/([A-Za-z ]+Airport)/);

        if (airport) {
            booking.pickupLocation = airport[1].trim();
        }

        // อังกฤษ
        let date =
            sec.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)).*?([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/i);

        if (date) {
            booking.pickupTime = date[1];
            booking.pickupDate = date[2];
        }

        // ไทย
        if (!booking.pickupDate) {

            date = sec.match(/(\d{1,2}\s+\S+\s+\d{4}).*?(\d{2}:\d{2})/);

            if (date) {
                booking.pickupDate = date[1];
                booking.pickupTime = date[2];
            }

        }

    }

    // ---------------- Return ----------------

    m =
        text.match(/Drop-off([\s\S]*?)Pick-up Guide/i) ||
        text.match(/จุดคืนรถ([\s\S]*?)วิธีการคืนรถ/i);

    if (m) {

        const sec = m[1];

        let airport = sec.match(/([A-Za-z ]+Airport)/);

        if (airport) {
            booking.returnLocation = airport[1].trim();
        }

        // อังกฤษ
        let date =
            sec.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)).*?([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/i);

        if (date) {
            booking.returnTime = date[1];
            booking.returnDate = date[2];
        }

        // ไทย
        if (!booking.returnDate) {

            date = sec.match(/(\d{1,2}\s+\S+\s+\d{4}).*?(\d{2}:\d{2})/);

            if (date) {
                booking.returnDate = date[1];
                booking.returnTime = date[2];
            }

        }

    }

    return booking;
}

module.exports = parseTrip;