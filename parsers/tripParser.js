function parseTrip(text) {
    text = text
        .replace(/\r/g, "")
        .replace(/\u0000/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim();  // เพิ่ม trim เพื่อตัดช่องว่างหัวท้าย

    const booking = Booking();

    booking.company = "Trip";
    booking.rawText = text;

    // Debug ข้อความก่อนจับข้อมูล
    console.log("Raw text:", booking.rawText);

    // Booking No
    let m =
        text.match(/Booking no\.?\s*:?\s*([A-Z0-9]+)/i) ||
        text.match(/หมายเลขการจอง\s*:?\s*([A-Z0-9]+)/i);

    if (m) {
        booking.bookingNo = m[1].trim();
    }

    // Phone
    m = text.match(/\+66[- ]?\d[\d -]{7,}/);
    if (m) {
        booking.customerPhone = m[0].replace(/[ -]/g, "");
    }

    // Customer Name (เพิ่มการใช้งานฟังก์ชันช่วยแยก)
    booking.customerName = extractCustomerName(text);

    // Car Type
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

    // Pickup
    parsePickupReturn(text, booking, "Pick-up", "Drop-off");

    // Return
    parsePickupReturn(text, booking, "Drop-off", "Pick-up Guide");

    return booking;
}

// ช่วยแยกชื่อภาษาอังกฤษง่าย ๆ
function extractCustomerName(text) {
    const lines = text.split("\n").map(line => line.trim()).filter(Boolean);

    for (let i = 0; i < lines.length - 1; i++) {
        if (/^[A-Z]+$/.test(lines[i]) && /^[A-Z]+$/.test(lines[i + 1])) {
            const fullname = `${lines[i]} ${lines[i + 1]}`;
            if (fullname.length > 5 && !fullname.includes("AIRPORT") && !fullname.includes("BOOKING")) {
                return fullname;
            }
        }
        if (/^[A-Z ]{6,}$/.test(lines[i])) {
            if (!lines[i].includes("AIRPORT") && !lines[i].includes("BOOKING")) {
                return lines[i];
            }
        }
    }
    return null;
}

function parsePickupReturn(text, booking, startLabel, endLabel) {
    let regexStart = new RegExp(`${startLabel}([\\s\\S]*?)${endLabel}`, "i");
    let m = text.match(regexStart);
    if (!m) return;

    const section = m[1];

    let airport = section.match(/([A-Za-z ]+Airport)/);
    if (airport) {
        if (startLabel === "Pick-up") booking.pickupLocation = airport[1].trim();
        if (startLabel === "Drop-off") booking.returnLocation = airport[1].trim();
    }

    let date = section.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)).*?([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/i);
    if (date) {
        if (startLabel === "Pick-up") {
            booking.pickupTime = date[1];
            booking.pickupDate = date[2];
        }
        if (startLabel === "Drop-off") {
            booking.returnTime = date[1];
            booking.returnDate = date[2];
        }
    } else {
        date = section.match(/(\d{1,2}\s+\S+\s+\d{4}).*?(\d{2}:\d{2})/);
        if (date) {
            if (startLabel === "Pick-up") {
                booking.pickupDate = date[1];
                booking.pickupTime = date[2];
            }
            if (startLabel === "Drop-off") {
                booking.returnDate = date[1];
                booking.returnTime = date[2];
            }
        }
    }
}
