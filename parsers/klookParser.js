const Booking = require("../models/booking");

// ============================
// Helper
// ============================

function cleanText(value = "") {
    return String(value)
        .replace(/\r/g, "")
        .replace(/\u0000/g, "")
        .replace(
            /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
            " "
        )
        .replace(/\uFFFD/g, "")
        .replace(/[ \t]+/g, " ")
        .trim();
}

function toOneLine(value = "") {
    return cleanText(value)
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeLocation(value = "") {
    return toOneLine(value)
        .replace(/^Chic\s+Network\s*-\s*/i, "")
        .replace(
            /^(?:Pick\s*-?\s*up|Pickup|Drop\s*-?\s*off|Dropoff)\s*:?\s*/i,
            ""
        )
        .replace(
            /^(?:Location|Station)\s*:?\s*/i,
            ""
        )
        .trim();
}

function normalizePhone(value = "") {
    const phone = String(value)
        .replace(/[()\s-]/g, "")
        .trim();

    if (/^66\d{9,10}$/.test(phone)) {
        return `+${phone}`;
    }

    return phone;
}

// ============================
// Booking Number
// ============================

function extractBookingNumber(text = "") {
    const source = toOneLine(text);

    const patterns = [
        /(?:Klook\s*)?(?:Booking|Reservation)\s*(?:No\.?|Number|ID|Reference)\s*[:#-]?\s*([A-Z0-9-]{6,})/i,

        /(?:Confirmation|Voucher)\s*(?:No\.?|Number|ID)\s*[:#-]?\s*([A-Z0-9-]{6,})/i,

        /\b([A-Z]{2,5}\d{5,12})\b/,

        /\b(\d{10,16})\b/
    ];

    for (const pattern of patterns) {
        const match = source.match(pattern);

        if (match) {
            return cleanText(
                match[1] || match[0]
            );
        }
    }

    return "";
}

// ============================
// Email
// ============================

function extractCustomerEmail(text = "") {
    const emails = [
        ...String(text).matchAll(
            /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
        )
    ].map(match =>
        match[0].toLowerCase()
    );

    return (
        emails.find(email =>
            !email.includes("@klook.com") &&
            !email.includes("@chiccarrent.com") &&
            !email.includes("@chicnetwork")
        ) || ""
    );
}

// ============================
// Phone
// ============================

function extractPhone(text = "") {
    const source = toOneLine(text);

    const patterns = [
        /\+66[\s()-]*\d(?:[\s()-]*\d){8,9}/,
        /\b66[\s()-]*\d(?:[\s()-]*\d){8,9}\b/,
        /\b0\d{9}\b/
    ];

    for (const pattern of patterns) {
        const match = source.match(pattern);

        if (match) {
            return normalizePhone(match[0]);
        }
    }

    return "";
}

// ============================
// ตรวจสอบชื่อบุคคล
// ============================

function isValidCustomerName(value = "") {
    const name = toOneLine(value);

    if (
        !/^[A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){1,4}$/.test(
            name
        )
    ) {
        return false;
    }

    const blockedWords = new Set([
        "klook",
        "chic",
        "network",
        "car",
        "rent",
        "booking",
        "voucher",
        "reservation",
        "customer",
        "driver",
        "guest",
        "name",
        "email",
        "phone",
        "mobile",
        "airport",
        "pickup",
        "dropoff",
        "vehicle",
        "automatic",
        "manual",
        "thailand"
    ]);

    const words = name
        .toLowerCase()
        .split(/\s+/);

    return words.every(
        word => !blockedWords.has(word)
    );
}

// ============================
// Customer Name
// ============================

function extractCustomerName(
    lines,
    text,
    customerEmail
) {
    const source = toOneLine(text);

    // ค้นหาหลังหัวข้อ Customer / Guest / Driver Name

    const labelRegex =
        /(?:Customer|Guest|Main\s+Driver|Primary\s+Driver|Driver)\s*(?:Name)?\s*:?\s*/gi;

    let labelMatch;

    while (
        (labelMatch =
            labelRegex.exec(source)) !== null
    ) {
        const start =
            labelMatch.index +
            labelMatch[0].length;

        let section = source
            .slice(start, start + 180)
            .split(
                /\b(?:Email|E-mail|Phone|Mobile|Contact|Vehicle|Car\s+type|Pick\s*-?\s*up|Pickup|Drop\s*-?\s*off|Dropoff|Booking|Reservation)\b/i
            )[0]
            .trim();

        const nameMatch = section.match(
            /^([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){1,4})/
        );

        if (
            nameMatch &&
            isValidCustomerName(nameMatch[1])
        ) {
            return toOneLine(nameMatch[1]);
        }
    }

    // ค้นหาชื่อที่อยู่ก่อนอีเมลลูกค้า

    if (customerEmail) {
        const emailIndex = lines.findIndex(
            line =>
                line
                    .toLowerCase()
                    .includes(
                        customerEmail.toLowerCase()
                    )
        );

        if (emailIndex >= 0) {
            for (
                let i = emailIndex - 1;
                i >= Math.max(0, emailIndex - 5);
                i--
            ) {
                let candidate = toOneLine(
                    lines[i]
                )
                    .replace(
                        /^(?:Customer|Guest|Driver|Name)\s*:?\s*/i,
                        ""
                    )
                    .trim();

                if (
                    isValidCustomerName(candidate)
                ) {
                    return candidate;
                }
            }
        }
    }

    // ตรวจทีละบรรทัด

    for (const originalLine of lines) {
        const line = toOneLine(
            originalLine
        )
            .replace(
                /^(?:Customer|Guest|Driver|Name)\s*:?\s*/i,
                ""
            )
            .trim();

        if (
            isValidCustomerName(line)
        ) {
            return line;
        }
    }

    return "";
}

// ============================
// วันที่และเวลาทั้งหมด
// ============================

function extractDateTimes(text = "") {
    const source = toOneLine(text);

    const results = [];

    const dateRegex =
        /\b(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\b/g;

    let match;

    while (
        (match = dateRegex.exec(source)) !==
        null
    ) {
        const item = {
            index: match.index,
            date: match[1],
            time: match[2]
        };

        const duplicate = results.some(
            result =>
                result.date === item.date &&
                result.time === item.time
        );

        if (!duplicate) {
            results.push(item);
        }
    }

    return results;
}

// ============================
// สถานที่ Chic Network
// ============================

function extractLocations(lines) {
    const locations = [];

    for (const originalLine of lines) {
        const line = toOneLine(
            originalLine
        );

        if (
            !/Chic\s+Network\s*-/i.test(
                line
            )
        ) {
            continue;
        }

        let location =
            normalizeLocation(line);

        location = location
            .split(
                /\s+T\d+\b/i
            )[0]
            .split(
                /\s+\d{4}-\d{2}-\d{2}\b/
            )[0]
            .trim();

        if (
            location &&
            !locations.includes(location)
        ) {
            locations.push(location);
        }
    }

    return locations;
}

// ============================
// ดึงข้อมูลรับรถและคืนรถ
// ============================

function extractRentalEvents(
    text,
    lines
) {
    const source = toOneLine(text);

    const events = [];

    /*
        ตัวอย่าง:

        Chic Network - Surat Thani Airport
        T123456
        2026-08-05 18:30
    */

    const eventRegex =
        /(Chic\s+Network\s*-\s+.{2,120}?)\s+T\d+\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/gi;

    let match;

    while (
        (match = eventRegex.exec(source)) !==
        null
    ) {
        const location =
            normalizeLocation(match[1]);

        events.push({
            location,
            date: match[2],
            time: match[3]
        });
    }

    // ถ้า Regex หลักหาไม่ได้
    // ใช้วิธีอ่านตามบรรทัด

    if (events.length === 0) {
        for (
            let i = 0;
            i < lines.length;
            i++
        ) {
            if (
                !/Chic\s+Network\s*-/i.test(
                    lines[i]
                )
            ) {
                continue;
            }

            const location =
                normalizeLocation(
                    lines[i]
                );

            const section = lines
                .slice(
                    i,
                    Math.min(
                        i + 10,
                        lines.length
                    )
                )
                .join(" ");

            const dateMatch =
                section.match(
                    /\b(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\b/
                );

            if (dateMatch) {
                events.push({
                    location,
                    date: dateMatch[1],
                    time: dateMatch[2]
                });
            }
        }
    }

    // Fallback ใช้วันที่และสถานที่ตามลำดับ

    if (events.length === 0) {
        const dates =
            extractDateTimes(source);

        const locations =
            extractLocations(lines);

        dates.forEach(
            (dateTime, index) => {
                events.push({
                    location:
                        locations[index] ||
                        locations[0] ||
                        "",
                    date: dateTime.date,
                    time: dateTime.time
                });
            }
        );
    }

    // ลบรายการซ้ำ

    return events.filter(
        (item, index, array) =>
            index ===
            array.findIndex(
                other =>
                    other.location ===
                        item.location &&
                    other.date === item.date &&
                    other.time === item.time
            )
    );
}

// ============================
// Vehicle
// ============================

function extractCar(lines, text) {
    // หา HDAV_ จากแต่ละบรรทัด

    const hdavLine = lines.find(
        line => /\bHDAV_/i.test(line)
    );

    if (hdavLine) {
        return toOneLine(hdavLine)
            .replace(
                /^(?:Vehicle|Car\s+type)\s*:?\s*/i,
                ""
            )
            .split(
                /\b(?:Pick\s*-?\s*up|Pickup|Drop\s*-?\s*off|Dropoff|Booking|Customer|Email|Phone)\b/i
            )[0]
            .trim();
    }

    const source = toOneLine(text);

    // หา Car type

    const carType = source.match(
        /Car\s+type\s*:?\s*(.{2,100}?)(?=\s+(?:Transmission|Pick\s*-?\s*up|Pickup|Drop\s*-?\s*off|Dropoff|Booking|Customer|Email|Phone)\b|$)/i
    );

    if (carType) {
        return toOneLine(carType[1])
            .replace(
                /\s+or\s+similar.*$/i,
                ""
            )
            .trim();
    }

    // หา Vehicle

    const vehicle = source.match(
        /Vehicle\s*:?\s*(.{2,100}?)(?=\s+(?:Pick\s*-?\s*up|Pickup|Drop\s*-?\s*off|Dropoff|Booking|Customer|Email|Phone)\b|$)/i
    );

    if (vehicle) {
        return toOneLine(vehicle[1]);
    }

    return "";
}

// ============================
// Parser หลัก
// ============================

function parseKlook(inputText) {
    const booking = Booking();

    const rawText = cleanText(
        inputText || ""
    );

    const lines = rawText
        .split(/\n+/)
        .map(line =>
            toOneLine(line)
        )
        .filter(Boolean);

    const flatText =
        toOneLine(rawText);

    booking.company = "Klook";
    booking.rawText = rawText;

    booking.bookingNo =
        extractBookingNumber(flatText);

    booking.customerEmail =
        extractCustomerEmail(flatText);

    booking.customerPhone =
        extractPhone(flatText);

    booking.phone =
        booking.customerPhone;

    booking.customerName =
        extractCustomerName(
            lines,
            flatText,
            booking.customerEmail
        );

    booking.renter =
        booking.customerName;

    booking.car =
        extractCar(
            lines,
            flatText
        );

    const rentalEvents =
        extractRentalEvents(
            rawText,
            lines
        );

    if (rentalEvents.length >= 1) {
        booking.pickupLocation =
            rentalEvents[0].location;

        booking.pickupDate =
            rentalEvents[0].date;

        booking.pickupTime =
            rentalEvents[0].time;
    }

    if (rentalEvents.length >= 2) {
        booking.returnLocation =
            rentalEvents[1].location;

        booking.returnDate =
            rentalEvents[1].date;

        booking.returnTime =
            rentalEvents[1].time;
    }

    booking.bookingNo =
        toOneLine(
            booking.bookingNo || ""
        );

    booking.customerName =
        toOneLine(
            booking.customerName || ""
        );

    booking.customerEmail =
        toOneLine(
            booking.customerEmail || ""
        );

    booking.customerPhone =
        toOneLine(
            booking.customerPhone || ""
        );

    booking.car =
        toOneLine(
            booking.car || ""
        );

    booking.pickupLocation =
        normalizeLocation(
            booking.pickupLocation || ""
        );

    booking.returnLocation =
        normalizeLocation(
            booking.returnLocation || ""
        );

    booking.pickupDate =
        toOneLine(
            booking.pickupDate || ""
        );

    booking.returnDate =
        toOneLine(
            booking.returnDate || ""
        );

    booking.pickupTime =
        toOneLine(
            booking.pickupTime || ""
        );

    booking.returnTime =
        toOneLine(
            booking.returnTime || ""
        );

    console.log("Klook parsed:", {
        bookingNo:
            booking.bookingNo,
        customerName:
            booking.customerName,
        pickupDate:
            booking.pickupDate,
        returnDate:
            booking.returnDate
    });

    return booking;
}

module.exports = parseKlook;