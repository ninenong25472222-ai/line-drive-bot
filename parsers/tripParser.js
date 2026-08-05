function parseTrip(text) {
    text = text
        .replace(/\r/g, "")
        .replace(/\u0000/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim();

    const booking = {};

    booking.company = "Trip";
    booking.rawText = text;

    // Booking No
    let m =
        text.match(/Booking no\.?\s*:?\s*([A-Z0-9]+)/i) ||
        text.match(/หมายเลขการจอง\s*:?\s*([A-Z0-9]+)/i);

    if (m) booking.bookingNo = m[1].trim();

    // Customer Phone (เบอร์โทร +66...)
    m = text.match(/\+66[- ]?\d[\d -]{7,}/);
    if (m) booking.customerPhone = m[0].replace(/[ -]/g, "");

    // Customer Name ภาษาอังกฤษ (แบบตัวพิมพ์ใหญ่เต็มบรรทัด หรือ 2 บรรทัด)
    const lines = text.split("\n").map(line => line.trim()).filter(Boolean);

    for (let i = 0; i < lines.length - 1; i++) {
        if (/^[A-Z]+$/.test(lines[i]) && /^[A-Z]+$/.test(lines[i + 1])) {
            const fullname = `${lines[i]} ${lines[i + 1]}`;
            if (fullname.length > 5 && !fullname.includes("AIRPORT") && !fullname.includes("BOOKING")) {
                booking.customerName = fullname;
                booking.renter = fullname;
                break;
            }
        }
        if (/^[A-Z ]{6,}$/.test(lines[i]) && !lines[i].includes("AIRPORT") && !lines[i].includes("BOOKING")) {
            booking.customerName = lines[i];
            booking.renter = lines[i];
            break;
        }
    }

    // Customer Name ภาษาไทย (ค้นหาจากคำว่า "ชื่อผู้ขับขี" หรือ "ชื่อผู้โดยสาร")
    if (!booking.customerName) {
        m = text.match(/(ชื่อผู้ขับขี|ชื่อผู้โดยสาร)\s*[:：]?\s*(\S.{1,50})/i);
        if (m) {
            booking.customerName = m[2].trim();
            booking.renter = booking.customerName;
        }
    }

    // Car Type (อังกฤษและไทย)
    m = text.match(/Car type\s*([\s\S]*?)Transmission/i) || text.match(/ประเภทรถ\s*[:：]?\s*([\s\S]*?)ระบบเกียร์/i);
    if (m) {
        booking.car = m[1]
            .replace(/or similar/i, "")
            .replace(/หรือรุ่นที.*/i, "")
            .replace(/\u0000/g, "")
            .replace(/\n/g, " ")
            .replace(/\s+/g, " ")
            .replace("มิตซูบิช ิ", "มิตซูบิชิ")
            .trim();
    }

    // Pickup location and datetime (อังกฤษและไทย)
    m = text.match(/Pick-up([\s\S]*?)Drop-off/i) || text.match(/จุดรับรถ\s*[:：]?([\s\S]*?)จุดคืนรถ/i);
    if (m) {
        const sec = m[1];

        let airport = sec.match(/([A-Za-z ]+Airport)/);
        if (airport) booking.pickupLocation = airport[1].trim();

        // อังกฤษ (เช่น 08:30 AM Jan 1, 2024)
        let date = sec.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)).*?([A-Za-z]{3,}\s+\d{1,2},\s+\d{4})/i);
        if (date) {
            booking.pickupTime = date[1];
            booking.pickupDate = date[2];
        } else {
            // ไทย (เช่น 2 ส.ค. 2026 08:30 น.)
            date = sec.match(/(\d{1,2}\s+\S+\s+\d{4}).*?(\d{1,2}:\d{2})/);
            if (date) {
                booking.pickupDate = date[1];
                booking.pickupTime = date[2];
            }
        }
    }

    // Return location and datetime (อังกฤษและไทย)
    m = text.match(/Drop-off([\s\S]*?)Pick-up Guide/i) || text.match(/จุดคืนรถ\s*[:：]?([\s\S]*?)วิธีการคืนรถ/i);
    if (m) {
        const sec = m[1];

        let airport = sec.match(/([A-Za-z ]+Airport)/);
        if (airport) booking.returnLocation = airport[1].trim();

        // อังกฤษ
        let date = sec.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)).*?([A-Za-z]{3,}\s+\d{1,2},\s+\d{4})/i);
        if (date) {
            booking.returnTime = date[1];
            booking.returnDate = date[2];
        } else {
            // ไทย
            date = sec.match(/(\d{1,2}\s+\S+\s+\d{4}).*?(\d{1,2}:\d{2})/);
            if (date) {
                booking.returnDate = date[1];
                booking.returnTime = date[2];
            }
        }
    }

    return booking;
}

module.exports = parseTrip;
