function fixBrokenText(rawText) {
    // รวมบรรทัดสั้น ๆ ที่ขาดตกบกพร่องกับบรรทัดถัดไป
    let lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
    let fixed = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length <= 3 && i + 1 < lines.length) {
            // รวมบรรทัดสั้นกับบรรทัดถัดไป
            if(fixed.length > 0) {
                fixed[fixed.length -1] += line;
            } else {
                fixed.push(line);
            }
        } else {
            fixed.push(line);
        }
    }
    return fixed.join(" ");
}

function parseTrip(rawText) {
    const text = fixBrokenText(rawText);

    const booking = { company: "Trip", rawText: text };

    // หมายเลขการจอง
    let m = text.match(/หมายเลขการจอง\s*:?\s*([A-Z0-9]+)/i);
    if (!m) m = text.match(/Booking no\.?\s*:?\s*([A-Z0-9]+)/i);
    if (m) booking.bookingNo = m[1].trim();

    // ชื่อผู้ขับขี่ (ใช้คำว่า "ชื่", "ชื่อผู้ขับขี่", "ชื่อผู้โดยสาร" เป็นหลัก)
    m = text.match(/ชื่อ[^\s]{0,10}\s*[:：]?\s*([^\d\n,]+)/i);
    if (m) {
        booking.customerName = m[1].trim();
        booking.renter = booking.customerName;
    }

    // เบอร์โทรศัพท์ +66...
    m = text.match(/\+66[- ]?\d[\d -]{7,}/);
    if (m) booking.customerPhone = m[0].replace(/[\s-]/g, "");

    // ประเภทรถ
    m = text.match(/ประเภทรถ\s*[:：]?\s*([\w\sก-๙]+)(?:หรือรุ่น|\sหรือรุ่น)?/i);
    if (!m) m = text.match(/Car type\s*([\s\S]*?)Transmission/i);
    if (m) {
        booking.car = m[1]
            .replace(/or similar/i, "")
            .replace(/หรือรุ่น.*/i, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    // จุดรับรถ และวันเวลา (ไทย/อังกฤษ)
    m = text.match(/จุดรับรถ\s*[:：]?\s*([\s\S]*?)หมายเลขติดต่อ/i);
    if (!m) m = text.match(/Pick-up([\s\S]*?)Drop-off/i);
    if (m) {
        let sec = m[1];

        // ตำแหน่งรับรถ
        let loc = sec.match(/([A-Za-z\s]+Airport|[^\d]+\d{5})/i);
        if (!loc) loc = sec.match(/Surat Thani Airport/i);  // ตัวอย่างเฉพาะ
        if (loc) booking.pickupLocation = loc[0].trim();

        // วันที่เวลา ภาษาอังกฤษ
        let dt = sec.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?).{0,10}([A-Za-z]{3,}\s+\d{1,2},?\s+\d{4})/i);
        if (dt) {
            booking.pickupTime = dt[1];
            booking.pickupDate = dt[2];
        } else {
            // ภาษาไทย เช่น 1 ส.ค. 2026 08:30 น.
            dt = sec.match(/(\d{1,2}\s+\S+\s+\d{4})\s+(\d{1,2}:\d{2})/);
            if (dt) {
                booking.pickupDate = dt[1];
                booking.pickupTime = dt[2];
            }
        }
    }

    // จุดคืนรถ และวันเวลา (ไทย/อังกฤษ)
    m = text.match(/จุดคืนรถ\s*[:：]?\s*([\s\S]*?)หมายเลขติดต่อ/i);
    if (!m) m = text.match(/Drop-off([\s\S]*?)Pick-up Guide/i);
    if (m) {
        let sec = m[1];

        // ตำแหน่งคืนรถ
        let loc = sec.match(/([A-Za-z\s]+Airport|[^\d]+\d{5})/i);
        if (!loc) loc = sec.match(/Surat Thani Airport/i);
        if (loc) booking.returnLocation = loc[0].trim();

        // วันที่เวลา ภาษาอังกฤษ
        let dt = sec.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?).{0,10}([A-Za-z]{3,}\s+\d{1,2},?\s+\d{4})/i);
        if (dt) {
            booking.returnTime = dt[1];
            booking.returnDate = dt[2];
        } else {
            // ภาษาไทย
            dt = sec.match(/(\d{1,2}\s+\S+\s+\d{4})\s+(\d{1,2}:\d{2})/);
            if (dt) {
                booking.returnDate = dt[1];
                booking.returnTime = dt[2];
            }
        }
    }

    return booking;
}

module.exports = parseTrip;
