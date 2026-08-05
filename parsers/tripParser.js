const Booking = require("../models/booking");

const CAR_MODELS = [
    { pattern: /\bXpander\b/i, name: "Mitsubishi Xpander" },
    { pattern: /\bPajero(?:\s+Sport)?\b/i, name: "Mitsubishi Pajero Sport" },
    { pattern: /\bHR\s*-?\s*V\b/i, name: "Honda HR-V" },
    { pattern: /\bYaris\s+Ativ\b/i, name: "Toyota Yaris Ativ" },
    { pattern: /\bYaris\b/i, name: "Toyota Yaris" },
    { pattern: /\bVios\b/i, name: "Toyota Vios" },
    { pattern: /\bFortuner\b/i, name: "Toyota Fortuner" },
    { pattern: /\bCorolla(?:\s+Altis)?\b/i, name: "Toyota Corolla" },
    { pattern: /\bCamry\b/i, name: "Toyota Camry" },
    { pattern: /\bAlphard\b/i, name: "Toyota Alphard" },
    { pattern: /\bHilux(?:\s+Revo)?\b/i, name: "Toyota Hilux" },
    { pattern: /\bCity\b/i, name: "Honda City" },
    { pattern: /\bCivic\b/i, name: "Honda Civic" },
    { pattern: /\bAccord\b/i, name: "Honda Accord" },
    { pattern: /\bD\s*-?\s*Max\b/i, name: "Isuzu D-Max" },
    { pattern: /\bAtto\s*3\b/i, name: "BYD Atto 3" },
    { pattern: /\bSeal\b/i, name: "BYD Seal" },
    { pattern: /\bErtiga\b/i, name: "Suzuki Ertiga" },
    { pattern: /\bSwift\b/i, name: "Suzuki Swift" }
];

const THAI_MONTHS = {
    "ม.ค.": "ม.ค.",
    "ก.พ.": "ก.พ.",
    "มี.ค.": "มี.ค.",
    "เม.ย.": "เม.ย.",
    "พ.ค.": "พ.ค.",
    "มิ.ย.": "มิ.ย.",
    "ก.ค.": "ก.ค.",
    "ส.ค.": "ส.ค.",
    "ก.ย.": "ก.ย.",
    "ต.ค.": "ต.ค.",
    "พ.ย.": "พ.ย.",
    "ธ.ค.": "ธ.ค.",
    "มกราคม": "มกราคม",
    "กุมภาพันธ์": "กุมภาพันธ์",
    "มีนาคม": "มีนาคม",
    "เมษายน": "เมษายน",
    "พฤษภาคม": "พฤษภาคม",
    "มิถุนายน": "มิถุนายน",
    "กรกฎาคม": "กรกฎาคม",
    "สิงหาคม": "สิงหาคม",
    "กันยายน": "กันยายน",
    "ตุลาคม": "ตุลาคม",
    "พฤศจิกายน": "พฤศจิกายน",
    "ธันวาคม": "ธันวาคม"
};

function cleanText(value = "") {
    return String(value)
        .replace(/\u0000/g, "")
        .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
        .replace(/\uFFFD/g, "")
        .replace(/[ \t]+/g, " ")
        .trim();
}

function toOneLine(value = "") {
    return cleanText(value)
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeThaiMonth(value = "") {
    const compact = String(value).replace(/\s+/g, "");
    return THAI_MONTHS[compact] || compact;
}

function pushDateTime(results, index, date, time) {
    const cleanDate = toOneLine(date);
    const cleanTime = toOneLine(time).toUpperCase();

    if (!cleanDate || !cleanTime) return;

    const duplicate = results.some(
        item => item.date === cleanDate && item.time === cleanTime
    );

    if (!duplicate) {
        results.push({ index, date: cleanDate, time: cleanTime });
    }
}

function extractDateTimes(text) {
    const results = [];

    const thaiMonth = [
        "ม\\s*\\.\\s*ค\\s*\\.",
        "ก\\s*\\.\\s*พ\\s*\\.",
        "มี\\s*\\.\\s*ค\\s*\\.",
        "เม\\s*\\.\\s*ย\\s*\\.",
        "พ\\s*\\.\\s*ค\\s*\\.",
        "มิ\\s*\\.\\s*ย\\s*\\.",
        "ก\\s*\\.\\s*ค\\s*\\.",
        "ส\\s*\\.\\s*ค\\s*\\.",
        "ก\\s*\\.\\s*ย\\s*\\.",
        "ต\\s*\\.\\s*ค\\s*\\.",
        "พ\\s*\\.\\s*ย\\s*\\.",
        "ธ\\s*\\.\\s*ค\\s*\\.",
        "มกราคม",
        "กุมภาพันธ์",
        "มีนาคม",
        "เมษายน",
        "พฤษภาคม",
        "มิถุนายน",
        "กรกฎาคม",
        "สิงหาคม",
        "กันยายน",
        "ตุลาคม",
        "พฤศจิกายน",
        "ธันวาคม"
    ].join("|");

    const thaiRegex = new RegExp(
        `(\\d{1,2})\\s*(${thaiMonth})\\s*(\\d{4})\\s*(\\d{1,2}:\\d{2})`,
        "gi"
    );

    let match;

    while ((match = thaiRegex.exec(text)) !== null) {
        const month = normalizeThaiMonth(match[2]);
        pushDateTime(
            results,
            match.index,
            `${match[1]} ${month} ${match[3]}`,
            match[4]
        );
    }

    const englishMonth =
        "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

    const monthFirst = new RegExp(
        `\\b(${englishMonth})\\s+(\\d{1,2}),?\\s+(\\d{4})\\s*(?:at\\s*)?(\\d{1,2}:\\d{2}\\s*(?:AM|PM)?)`,
        "gi"
    );

    while ((match = monthFirst.exec(text)) !== null) {
        pushDateTime(
            results,
            match.index,
            `${match[1]} ${match[2]}, ${match[3]}`,
            match[4]
        );
    }

    const dayFirst = new RegExp(
        `\\b(\\d{1,2})\\s+(${englishMonth})\\s+(\\d{4})\\s*(?:at\\s*)?(\\d{1,2}:\\d{2}\\s*(?:AM|PM)?)`,
        "gi"
    );

    while ((match = dayFirst.exec(text)) !== null) {
        pushDateTime(
            results,
            match.index,
            `${match[1]} ${match[2]} ${match[3]}`,
            match[4]
        );
    }

    const timeFirst = new RegExp(
        `\\b(\\d{1,2}:\\d{2}\\s*(?:AM|PM))\\s*,?\\s*(${englishMonth})\\s+(\\d{1,2}),?\\s+(\\d{4})`,
        "gi"
    );

    while ((match = timeFirst.exec(text)) !== null) {
        pushDateTime(
            results,
            match.index,
            `${match[2]} ${match[3]}, ${match[4]}`,
            match[1]
        );
    }

    const numericRegex =
        /\b(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s+(\d{1,2}:\d{2})\b/g;

    while ((match = numericRegex.exec(text)) !== null) {
        pushDateTime(results, match.index, match[1], match[2]);
    }

    return results.sort((a, b) => a.index - b.index);
}

function collectAirportLocations(text) {
    const locations = [];
    const airportRegex =
        /\b([A-Z][A-Za-z'’.-]*(?:\s+[A-Z][A-Za-z'’.-]*){0,5}\s+Airport(?:\s*\([A-Z]{3}\))?)/g;

    let match;

    while ((match = airportRegex.exec(text)) !== null) {
        const location = toOneLine(match[1]);

        if (location && !locations.includes(location)) {
            locations.push(location);
        }
    }

    return locations;
}

function findAirportNearDate(text, dateIndex) {
    const start = Math.max(0, dateIndex - 220);
    const beforeDate = text.slice(start, dateIndex);
    const airportRegex =
        /\b([A-Z][A-Za-z'’.-]*(?:\s+[A-Z][A-Za-z'’.-]*){0,5}\s+Airport(?:\s*\([A-Z]{3}\))?)/g;

    let match;
    let lastLocation = "";

    while ((match = airportRegex.exec(beforeDate)) !== null) {
        lastLocation = toOneLine(match[1]);
    }

    return lastLocation;
}

function extractCustomerName(lines, text) {
    const source = toOneLine(text || "");

    // หาชื่อที่อยู่หลังหัวข้อ Main Driver / Driver Name
    const driverLabels = [
        /Main\s+Driver(?:\s+Name)?\s*:?\s*/i,
        /Primary\s+Driver(?:\s+Name)?\s*:?\s*/i,
        /Driver(?:'s)?\s+Name\s*:?\s*/i
    ];

    for (const labelPattern of driverLabels) {
        const labelMatch = labelPattern.exec(source);

        if (!labelMatch || typeof labelMatch.index !== "number") {
            continue;
        }

        const start =
            labelMatch.index + labelMatch[0].length;

        let afterLabel = source
            .slice(start, start + 200)
            .trim();

        // ตัดข้อความตั้งแต่หัวข้อข้อมูลรถเป็นต้นไป
        afterLabel = afterLabel
            .split(
                /\b(?:Car\s+details|Car\s+type|Transmission|Automatic|Manual|Phone|Mobile|Contact|Pick-up|Pickup|Drop-off|Dropoff)\b/i
            )[0]
            .trim();

        // รับเฉพาะคำภาษาอังกฤษตัวพิมพ์ใหญ่ 2-4 คำ
        const nameMatch = afterLabel.match(
            /^([A-Z][A-Z'-]{1,39}(?:\s+[A-Z][A-Z'-]{1,39}){1,3})\b/
        );

        if (nameMatch) {
            return toOneLine(nameMatch[1]);
        }
    }

    // กรณีชื่ออยู่ก่อนคำว่า Car details หรือ Car type
    const beforeCarSection = source.match(
        /\b([A-Z][A-Z'-]{1,39}(?:\s+[A-Z][A-Z'-]{1,39}){1,3})\s+(?=Car\s+(?:details|type)\b)/
    );

    if (beforeCarSection) {
        return toOneLine(beforeCarSection[1]);
    }

    // คำที่ห้ามนำมาเป็นชื่อ
    const blockedWords = new Set([
        "TRIP",
        "COM",
        "TRAVEL",
        "SINGAPORE",
        "PTE",
        "LTD",
        "CHIC",
        "CAR",
        "RENT",
        "AIRPORT",
        "SURAT",
        "THANI",
        "THAILAND",
        "ARRIVAL",
        "HALL",
        "BOOKING",
        "VOUCHER",
        "DRIVER",
        "MAIN",
        "DETAILS",
        "TYPE",
        "AUTOMATIC",
        "MANUAL"
    ]);

    // ค้นจากแต่ละบรรทัด
    for (const originalLine of lines) {
        const line = toOneLine(originalLine);

        if (
            !line ||
            /Airport|Trip\.com|Car\s+details|Car\s+type|Transmission/i.test(
                line
            )
        ) {
            continue;
        }

        // ดึงเฉพาะคำตัวพิมพ์ใหญ่ช่วงต้นบรรทัด
        const leadingName = line.match(
            /^([A-Z][A-Z'-]{1,39}(?:\s+[A-Z][A-Z'-]{1,39}){1,3})\b/
        );

        if (!leadingName) {
            continue;
        }

        const candidate = toOneLine(leadingName[1]);
        const words = candidate.split(/\s+/);

        if (
            words.length >= 2 &&
            words.length <= 4 &&
            words.every(word => !blockedWords.has(word))
        ) {
            return candidate;
        }
    }

    // กรณีชื่อถูกแยกเป็นสองบรรทัด
    for (let i = 0; i < lines.length - 1; i++) {
        const firstName = toOneLine(lines[i]);
        const lastName = toOneLine(lines[i + 1]);

        const firstValid =
            /^[A-Z][A-Z'-]{2,39}$/.test(firstName);

        const lastValid =
            /^[A-Z][A-Z'-]{2,39}$/.test(lastName);

        if (
            firstValid &&
            lastValid &&
            !blockedWords.has(firstName) &&
            !blockedWords.has(lastName)
        ) {
            return `${firstName} ${lastName}`;
        }
    }

    return "";
}

function extractPhone(text) {
    let match = text.match(/\+66[\s-]?\d[\d\s-]{7,}\d/);

    if (!match) {
        match = text.match(/(?<!\d)0\d{9}(?!\d)/);
    }

    return match ? match[0].replace(/[\s-]/g, "") : "";
}

function extractCar(text) {
    for (const car of CAR_MODELS) {
        if (car.pattern.test(text)) return car.name;
    }

    const generic = text.match(
        /\b(?:Toyota|Honda|Mitsubishi|Nissan|Mazda|Isuzu|Ford|MG|BYD|Suzuki|BMW|Mercedes-Benz|Hyundai|Kia)\s+[A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+)?\b/i
    );

    return generic ? toOneLine(generic[0]) : "";
}

function parseTrip(inputText) {
    const booking = Booking();
    const rawText = cleanText(inputText || "");
    const flatText = toOneLine(rawText);
    const lines = rawText
        .split(/\n+/)
        .map(toOneLine)
        .filter(Boolean);

    booking.company = "Trip";
    booking.bookingNo = extractBookingNumber(flatText);

    booking.customerName = extractCustomerName(lines, flatText);
    booking.renter = booking.customerName;

    booking.customerPhone = extractPhone(flatText);
    booking.phone = booking.customerPhone;

    booking.car = extractCar(flatText);

    const dateTimes = extractDateTimes(flatText);
    const airportLocations = collectAirportLocations(flatText);

    if (dateTimes.length >= 1) {
        booking.pickupDate = dateTimes[0].date;
        booking.pickupTime = dateTimes[0].time;
        booking.pickupLocation =
            findAirportNearDate(flatText, dateTimes[0].index) ||
            airportLocations[0] ||
            "";
    }

    if (dateTimes.length >= 2) {
        booking.returnDate = dateTimes[1].date;
        booking.returnTime = dateTimes[1].time;
        booking.returnLocation =
            findAirportNearDate(flatText, dateTimes[1].index) ||
            airportLocations[1] ||
            airportLocations[0] ||
            "";
    }

    booking.pickupDate = toOneLine(booking.pickupDate || "");
    booking.pickupTime = toOneLine(booking.pickupTime || "");
    booking.pickupLocation = toOneLine(booking.pickupLocation || "");
    booking.returnDate = toOneLine(booking.returnDate || "");
    booking.returnTime = toOneLine(booking.returnTime || "");
    booking.returnLocation = toOneLine(booking.returnLocation || "");
    booking.customerEmail = "";

    return booking;
}

module.exports = parseTrip;
