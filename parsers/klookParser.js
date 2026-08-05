const Booking = require("../models/booking");

const KLOOK_PARSER_VERSION = "2026-08-05-V4";

// ============================
// Helper
// ============================

function cleanText(value = "") {
    return String(value)
        .replace(/\r/g, "")
        .replace(/\u0000/g, "")
        .replace(/\u00A0/g, " ")
        .replace(
            /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
            " "
        )
        .replace(/\uFFFD/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function toOneLine(value = "") {
    return cleanText(value)
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function titleCase(value = "") {
    return toOneLine(value)
        .toLowerCase()
        .replace(
            /\b[a-z]/g,
            letter => letter.toUpperCase()
        );
}

// ============================
// Booking Number
// ============================

function extractBookingNumber(text = "") {
    const source = toOneLine(text);

    const patterns = [
        /klook_booking_reference_number[^A-Z0-9]*([A-Z]{3}\d{6,12})/i,
        /\b([A-Z]{3}\d{6,12})\b/
    ];

    for (const pattern of patterns) {
        const match = source.match(pattern);

        if (match) {
            return match[1];
        }
    }

    return "";
}

// ============================
// Customer Email
// ============================

function extractCustomerEmail(text = "") {
    const emails = [
        ...String(text).matchAll(
            /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
        )
    ].map(item => item[0].toLowerCase());

    return (
        emails.find(email =>
            !email.includes("@klook.com") &&
            !email.includes("@chiccarrent.com") &&
            !email.includes("@outlook.com") &&
            !email.includes("@microsoft.com")
        ) || ""
    );
}

// ============================
// Customer Name
// ============================

function isValidNamePart(value = "") {
    const word = String(value).trim();

    if (
        !/^[A-Za-z][A-Za-z'.-]{2,39}$/.test(
            word
        )
    ) {
        return false;
    }

    const blocked = new Set([
        "mail",
        "inbox",
        "office",
        "outlook",
        "klook",
        "booking",
        "reservation",
        "customer",
        "driver",
        "airport",
        "network",
        "surat",
        "thani"
    ]);

    return !blocked.has(
        word.toLowerCase()
    );
}

function extractCustomerName(text = "") {
    const lines = cleanText(text)
        .split(/\n+/)
        .map(toOneLine)
        .filter(Boolean);

    /*
        ตัวอย่างจริงจาก OCR:

        dAawineudusa Jirawat/Wongsrisuk
    */

    for (const line of lines) {
        if (
            /https?:|outlook|office\.com|mail\/|inbox\/|@/i.test(
                line
            )
        ) {
            continue;
        }

        const match = line.match(
            /\b([A-Za-z][A-Za-z'.-]{2,39})\s*\/\s*([A-Za-z][A-Za-z'.-]{2,39})\b/
        );

        if (
            match &&
            isValidNamePart(match[1]) &&
            isValidNamePart(match[2])
        ) {
            return `${match[1]} ${match[2]}`;
        }
    }

    const source = toOneLine(text);

    const labelledPatterns = [
        /Customer\s+Name\s*:?\s*([A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+){1,3})/i,

        /Driver\s+Name\s*:?\s*([A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+){1,3})/i,

        /Main\s+Driver\s*:?\s*([A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+){1,3})/i
    ];

    for (const pattern of labelledPatterns) {
        const match = source.match(pattern);

        if (match) {
            return toOneLine(match[1]);
        }
    }

    /*
        ห้ามสุ่มชื่อจากข้อความ OCR
        ป้องกันการได้ชื่อ o AY
    */

    return "";
}

// ============================
// Phone
// ============================

function normalizePhone(value = "") {
    const raw = String(value).trim();

    let digits = raw.replace(/\D/g, "");

    if (!digits) {
        return "";
    }

    /*
        66-0807726267
        660807726267
        เปลี่ยนเป็น +66807726267
    */

    if (
        digits.startsWith("660") &&
        digits.length === 12
    ) {
        digits =
            `66${digits.slice(3)}`;

        return `+${digits}`;
    }

    if (
        digits.startsWith("66") &&
        digits.length >= 11
    ) {
        return `+${digits}`;
    }

    if (
        digits.startsWith("0") &&
        digits.length === 10
    ) {
        return `+66${digits.slice(1)}`;
    }

    return raw.startsWith("+")
        ? `+${digits}`
        : digits;
}

function extractPhone(text = "") {
    const source = toOneLine(text);

    const patterns = [
        /\b66[\s-]*0\d(?:[\s-]*\d){8}\b/,
        /\+66[\s-]*\d(?:[\s-]*\d){8,9}/,
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
// Location
// ============================

function normalizeLocation(value = "") {
    const source = toOneLine(value);

    const chicMatch = source.match(
        /Chic\s+Network\s*-\s*([A-Za-z][A-Za-z'. -]{1,70}?\s+Airport)\b/i
    );

    if (chicMatch) {
        return titleCase(chicMatch[1]);
    }

    const airportMatch = source.match(
        /\b([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,5}\s+Airport)\b/i
    );

    return airportMatch
        ? titleCase(airportMatch[1])
        : "";
}

// ============================
// Pickup / Return
// ============================

function extractRentalEvents(text = "") {
    const lines = cleanText(text)
        .split(/\n+/)
        .map(toOneLine)
        .filter(Boolean);

    const events = [];

    for (
        let index = 0;
        index < lines.length;
        index++
    ) {
        if (
            !/Chic\s+Network\s*-/i.test(
                lines[index]
            )
        ) {
            continue;
        }

        const location =
            normalizeLocation(
                lines[index]
            );

        if (!location) {
            continue;
        }

        const nearby = lines
            .slice(
                index,
                Math.min(
                    lines.length,
                    index + 10
                )
            )
            .join(" ");

        const dateTime = nearby.match(
            /\b(\d{4}-\d{2}-\d{2})\s+([0-2]?\d:[0-5]\d)\b/
        );

        if (!dateTime) {
            continue;
        }

        const event = {
            location,
            date: dateTime[1],
            time: dateTime[2]
        };

        const duplicate =
            events.some(item =>
                item.location === event.location &&
                item.date === event.date &&
                item.time === event.time
            );

        if (!duplicate) {
            events.push(event);
        }
    }

    /*
        Fallback กรณี OCR รวมทุกอย่างเป็นบรรทัดเดียว
    */

    if (events.length < 2) {
        const source = toOneLine(text);

        const regex =
            /Chic\s+Network\s*-\s*([A-Za-z][A-Za-z'. -]{1,70}?\s+Airport)\b[\s\S]{0,180}?(\d{4}-\d{2}-\d{2})\s+([0-2]?\d:[0-5]\d)/gi;

        let match;

        while (
            (match = regex.exec(source)) !== null
        ) {
            const event = {
                location:
                    titleCase(match[1]),

                date: match[2],
                time: match[3]
            };

            const duplicate =
                events.some(item =>
                    item.location ===
                        event.location &&
                    item.date ===
                        event.date &&
                    item.time ===
                        event.time
                );

            if (!duplicate) {
                events.push(event);
            }
        }
    }

    return events;
}

// ============================
// Vehicle
// ============================

function extractCar(text = "") {
    const lines = cleanText(text)
        .split(/\n+/)
        .map(toOneLine)
        .filter(Boolean);

    let carSource = "";

    const hdavLine = lines.find(
        line => /\bHDAV_/i.test(line)
    );

    if (hdavLine) {
        carSource = hdavLine;
    } else {
        carSource = toOneLine(text);
    }

    const knownCars = [
        [
            /\bYaris\s+Ativ\b/i,
            "Toyota Yaris Ativ"
        ],
        [
            /\bYaris\b/i,
            "Toyota Yaris"
        ],
        [
            /\bHR\s*-?\s*V\b/i,
            "Honda HR-V"
        ],
        [
            /\bCity\b/i,
            "Honda City"
        ],
        [
            /\bCivic\b/i,
            "Honda Civic"
        ],
        [
            /\bXpander\b/i,
            "Mitsubishi Xpander"
        ],
        [
            /\bPajero(?:\s+Sport)?\b/i,
            "Mitsubishi Pajero Sport"
        ],
        [
            /\bVios\b/i,
            "Toyota Vios"
        ],
        [
            /\bFortuner\b/i,
            "Toyota Fortuner"
        ],
        [
            /\bCorolla(?:\s+Altis)?\b/i,
            "Toyota Corolla Altis"
        ],
        [
            /\bCamry\b/i,
            "Toyota Camry"
        ],
        [
            /\bD\s*-?\s*Max\b/i,
            "Isuzu D-Max"
        ],
        [
            /\bSwift\b/i,
            "Suzuki Swift"
        ],
        [
            /\bErtiga\b/i,
            "Suzuki Ertiga"
        ],
        [
            /\bAtto\s*3\b/i,
            "BYD Atto 3"
        ],
        [
            /\bSeal\b/i,
            "BYD Seal"
        ]
    ];

    for (const [pattern, name] of knownCars) {
        if (pattern.test(carSource)) {
            return name;
        }
    }

    const generic = carSource.match(
        /HDAV[_\s-]*(Toyota|Honda|Mitsubishi|Nissan|Mazda|Isuzu|Suzuki|MG|BYD|Ford|Hyundai|Kia)\s+([A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+){0,3})/i
    );

    if (!generic) {
        return "";
    }

    return (
        `${titleCase(generic[1])} ` +
        `${titleCase(generic[2])}`
    )
        .replace(
            /\s+(?:AT|MT|Automatic|Manual).*$/i,
            ""
        )
        .trim();
}

// ============================
// Main Parser
// ============================

function parseKlook(inputText) {
    console.log(
        "KLOOK_PARSER_VERSION:",
        KLOOK_PARSER_VERSION
    );

    const booking = Booking();

    const text = cleanText(
        inputText || ""
    );

    booking.company = "Klook";
    booking.rawText = text;

    booking.bookingNo =
        extractBookingNumber(text);

    booking.customerEmail =
        extractCustomerEmail(text);

    booking.customerName =
        extractCustomerName(text);

    booking.renter =
        booking.customerName;

    booking.customerPhone =
        extractPhone(text);

    booking.phone =
        booking.customerPhone;

    const events =
        extractRentalEvents(text);

    if (events.length >= 1) {
        booking.pickupLocation =
            events[0].location;

        booking.pickupDate =
            events[0].date;

        booking.pickupTime =
            events[0].time;
    }

    if (events.length >= 2) {
        booking.returnLocation =
            events[1].location;

        booking.returnDate =
            events[1].date;

        booking.returnTime =
            events[1].time;
    }

    booking.car =
        extractCar(text);

    console.log("Klook result:", {
        bookingNo:
            booking.bookingNo,

        customerName:
            booking.customerName,

        customerPhone:
            booking.customerPhone,

        pickupLocation:
            booking.pickupLocation,

        pickupDate:
            booking.pickupDate,

        pickupTime:
            booking.pickupTime,

        returnLocation:
            booking.returnLocation,

        returnDate:
            booking.returnDate,

        returnTime:
            booking.returnTime,

        car:
            booking.car
    });

    return booking;
}

module.exports = parseKlook;