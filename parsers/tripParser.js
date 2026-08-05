const Booking = require("../models/booking");

const CAR_MODELS = [
    {
        pattern: /\bXpander\b/i,
        name: "Mitsubishi Xpander"
    },
    {
        pattern: /\bPajero(?:\s+Sport)?\b/i,
        name: "Mitsubishi Pajero Sport"
    },
    {
        pattern: /\bHR\s*-?\s*V\b/i,
        name: "Honda HR-V"
    },
    {
        pattern: /\bYaris\s+Ativ\b/i,
        name: "Toyota Yaris Ativ"
    },
    {
        pattern: /\bYaris\b/i,
        name: "Toyota Yaris"
    },
    {
        pattern: /\bVios\b/i,
        name: "Toyota Vios"
    },
    {
        pattern: /\bFortuner\b/i,
        name: "Toyota Fortuner"
    },
    {
        pattern: /\bCorolla(?:\s+Altis)?\b/i,
        name: "Toyota Corolla"
    },
    {
        pattern: /\bCamry\b/i,
        name: "Toyota Camry"
    },
    {
        pattern: /\bAlphard\b/i,
        name: "Toyota Alphard"
    },
    {
        pattern: /\bHilux(?:\s+Revo)?\b/i,
        name: "Toyota Hilux"
    },
    {
        pattern: /\bCity\b/i,
        name: "Honda City"
    },
    {
        pattern: /\bCivic\b/i,
        name: "Honda Civic"
    },
    {
        pattern: /\bAccord\b/i,
        name: "Honda Accord"
    },
    {
        pattern: /\bD\s*-?\s*Max\b/i,
        name: "Isuzu D-Max"
    },
    {
        pattern: /\bAtto\s*3\b/i,
        name: "BYD Atto 3"
    },
    {
        pattern: /\bSeal\b/i,
        name: "BYD Seal"
    },
    {
        pattern: /\bErtiga\b/i,
        name: "Suzuki Ertiga"
    },
    {
        pattern: /\bSwift\b/i,
        name: "Suzuki Swift"
    }
];

const BLOCKED_NAME_WORDS = new Set([
    "TRIP",
    "COM",
    "TRAVEL",
    "SINGAPORE",
    "PTE",
    "LTD",
    "THB",
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
    "PRIMARY",
    "DETAILS",
    "TYPE",
    "TRANSMISSION",
    "AUTOMATIC",
    "MANUAL",
    "PICKUP",
    "DROPOFF",
    "HONDA",
    "TOYOTA",
    "MITSUBISHI",
    "NISSAN",
    "MAZDA",
    "ISUZU",
    "FORD",
    "SUZUKI",
    "HYUNDAI",
    "KIA"
]);

// ============================
// ทำความสะอาดข้อความ
// ============================

function cleanText(value = "") {
    return String(value)
        .replace(/\u0000/g, "")
        .replace(
            /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
            " "
        )
        .replace(/\uFFFD/g, "")
        .replace(/[ \t]+/g, " ")
        .trim();
}

// ============================
// เปลี่ยนข้อความให้เหลือบรรทัดเดียว
// ============================

function toOneLine(value = "") {
    return cleanText(value)
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// ============================
// ทำความสะอาดชื่อสถานที่
// ============================

function normalizeLocation(value = "") {
    return toOneLine(value)
        .replace(
            /^(?:Pick\s*-?\s*up|Pickup|Drop\s*-?\s*off|Dropoff)\s+/i,
            ""
        )
        .replace(
            /^(?:Location|Pick-up location|Drop-off location)\s*:?\s*/i,
            ""
        )
        .trim();
}

// ============================
// แก้ชื่อเดือนไทยที่มีช่องว่าง
// ============================

function normalizeThaiMonth(value = "") {
    return String(value)
        .replace(/\s+/g, "")
        .replace(/^ม\.ค\.$/, "ม.ค.")
        .replace(/^ก\.พ\.$/, "ก.พ.")
        .replace(/^มี\.ค\.$/, "มี.ค.")
        .replace(/^เม\.ย\.$/, "เม.ย.")
        .replace(/^พ\.ค\.$/, "พ.ค.")
        .replace(/^มิ\.ย\.$/, "มิ.ย.")
        .replace(/^ก\.ค\.$/, "ก.ค.")
        .replace(/^ส\.ค\.$/, "ส.ค.")
        .replace(/^ก\.ย\.$/, "ก.ย.")
        .replace(/^ต\.ค\.$/, "ต.ค.")
        .replace(/^พ\.ย\.$/, "พ.ย.")
        .replace(/^ธ\.ค\.$/, "ธ.ค.");
}

// ============================
// เพิ่มวันที่และเวลา
// ============================

function pushDateTime(
    results,
    index,
    date,
    time
) {
    const cleanDate = toOneLine(date);

    const cleanTime = toOneLine(time)
        .toUpperCase();

    if (!cleanDate || !cleanTime) {
        return;
    }

    const duplicate = results.some(
        item =>
            item.date === cleanDate &&
            item.time === cleanTime
    );

    if (!duplicate) {
        results.push({
            index,
            date: cleanDate,
            time: cleanTime
        });
    }
}

// ============================
// ค้นหาวันที่และเวลา
// ============================

function extractDateTimes(text) {
    const results = [];

    let match;

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

    while (
        (match = thaiRegex.exec(text)) !== null
    ) {
        pushDateTime(
            results,
            match.index,
            `${match[1]} ${normalizeThaiMonth(
                match[2]
            )} ${match[3]}`,
            match[4]
        );
    }

    const englishMonth =
        "Jan(?:uary)?|" +
        "Feb(?:ruary)?|" +
        "Mar(?:ch)?|" +
        "Apr(?:il)?|" +
        "May|" +
        "Jun(?:e)?|" +
        "Jul(?:y)?|" +
        "Aug(?:ust)?|" +
        "Sep(?:tember)?|" +
        "Oct(?:ober)?|" +
        "Nov(?:ember)?|" +
        "Dec(?:ember)?";

    // Aug 5, 2026 6:30 PM

    const monthFirst = new RegExp(
        `\\b(${englishMonth})\\s+` +
        `(\\d{1,2}),?\\s+` +
        `(\\d{4})\\s*` +
        `(?:at\\s*)?` +
        `(\\d{1,2}:\\d{2}\\s*(?:AM|PM)?)`,
        "gi"
    );

    while (
        (match = monthFirst.exec(text)) !== null
    ) {
        pushDateTime(
            results,
            match.index,
            `${match[1]} ${match[2]}, ${match[3]}`,
            match[4]
        );
    }

    // 5 Aug 2026 6:30 PM

    const dayFirst = new RegExp(
        `\\b(\\d{1,2})\\s+` +
        `(${englishMonth})\\s+` +
        `(\\d{4})\\s*` +
        `(?:at\\s*)?` +
        `(\\d{1,2}:\\d{2}\\s*(?:AM|PM)?)`,
        "gi"
    );

    while (
        (match = dayFirst.exec(text)) !== null
    ) {
        pushDateTime(
            results,
            match.index,
            `${match[1]} ${match[2]} ${match[3]}`,
            match[4]
        );
    }

    // 6:30 PM Aug 5, 2026

    const timeFirst = new RegExp(
        `\\b(\\d{1,2}:\\d{2}\\s*(?:AM|PM))` +
        `\\s*,?\\s*` +
        `(${englishMonth})\\s+` +
        `(\\d{1,2}),?\\s+` +
        `(\\d{4})`,
        "gi"
    );

    while (
        (match = timeFirst.exec(text)) !== null
    ) {
        pushDateTime(
            results,
            match.index,
            `${match[2]} ${match[3]}, ${match[4]}`,
            match[1]
        );
    }

    // 05/08/2026 18:30

    const numericRegex =
        /\b(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s+(\d{1,2}:\d{2})\b/g;

    while (
        (match = numericRegex.exec(text)) !== null
    ) {
        pushDateTime(
            results,
            match.index,
            match[1],
            match[2]
        );
    }

    return results.sort(
        (a, b) => a.index - b.index
    );
}

// ============================
// ค้นหาสนามบินทั้งหมด
// ============================

function collectAirportLocations(text) {
    const locations = [];

    const airportRegex =
        /\b([A-Z][A-Za-z'’.-]*(?:\s+[A-Z][A-Za-z'’.-]*){0,5}\s+Airport(?:\s*\([A-Z]{3}\))?)/g;

    let match;

    while (
        (match = airportRegex.exec(text)) !== null
    ) {
        const location = normalizeLocation(
            match[1]
        );

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
// หาสนามบินใกล้วันที่
// ============================

function findAirportNearDate(
    text,
    dateIndex
) {
    const start = Math.max(
        0,
        dateIndex - 240
    );

    const beforeDate = text.slice(
        start,
        dateIndex
    );

    const airportRegex =
        /\b([A-Z][A-Za-z'’.-]*(?:\s+[A-Z][A-Za-z'’.-]*){0,5}\s+Airport(?:\s*\([A-Z]{3}\))?)/g;

    let match;

    let lastLocation = "";

    while (
        (match =
            airportRegex.exec(beforeDate)) !==
        null
    ) {
        lastLocation = normalizeLocation(
            match[1]
        );
    }

    return lastLocation;
}

// ============================
// Booking Number
// ============================

function extractBookingNumber(text) {
    const labelled = text.match(
        /(?:Booking\s*(?:No\.?|Number)|Confirmation\s*(?:No\.?|Number))\s*[:#-]?\s*([A-Z0-9-]{6,})/i
    );

    if (labelled) {
        return labelled[1];
    }

    const voucher = text.match(
        /\bC\d{10,20}\b/
    );

    if (voucher) {
        return voucher[0];
    }

    const longNumber = text.match(
        /(?<![A-Z0-9])\d{12,20}(?!\d)/
    );

    return longNumber
        ? longNumber[0]
        : "";
}

// ============================
// ตรวจว่าข้อความเป็นชื่อหรือไม่
// ============================

function isValidNameCandidate(
    candidate
) {
    const name = toOneLine(candidate);

    const words = name
        .split(/\s+/)
        .filter(Boolean);

    if (
        words.length < 2 ||
        words.length > 4
    ) {
        return false;
    }

    return words.every(word => {
        const upperWord =
            word.toUpperCase();

        return (
            /^[A-Z][A-Z'-]{1,39}$/.test(
                word
            ) &&
            !BLOCKED_NAME_WORDS.has(
                upperWord
            )
        );
    });
}

// ============================
// ค้นหาชื่อลูกค้า
// ============================

function extractCustomerName(
    lines,
    text
) {
    const source = toOneLine(text);

    // ค้นชื่อหลัง Main Driver

    const driverLabelRegex =
        /(?:Main\s+Driver(?:\s+Name)?|Primary\s+Driver(?:\s+Name)?|Driver(?:'s)?\s+Name)\s*:?\s*/gi;

    let labelMatch;

    while (
        (labelMatch =
            driverLabelRegex.exec(source)) !==
        null
    ) {
        const start =
            labelMatch.index +
            labelMatch[0].length;

        // อ่านข้อความหลังหัวข้อชื่อแค่ช่วงสั้นๆ
        // และตัดก่อนถึงข้อมูลรถ

        const section = source
            .slice(start, start + 240)
            .split(
                /\b(?:Car\s+details|Car\s+type|Transmission|Automatic|Manual|Phone|Mobile|Contact|Pick\s*-?\s*up|Pickup|Drop\s*-?\s*off|Dropoff|Rental\s+details)\b/i
            )[0]
            .trim();

        // รับเฉพาะตัวพิมพ์ใหญ่ 2-4 คำ

        const nameMatch = section.match(
            /^([A-Z][A-Z'-]{1,39}(?:\s+[A-Z][A-Z'-]{1,39}){1,3})(?=\s|$)/
        );

        if (
            nameMatch &&
            isValidNameCandidate(
                nameMatch[1]
            )
        ) {
            return toOneLine(
                nameMatch[1]
            );
        }
    }

    // กรณีชื่ออยู่ก่อน Car details
    // ตัวอย่าง:
    // PAKNAPAT AIAMNAK Car details

    const beforeCarSection =
        source.match(
            /\b([A-Z][A-Z'-]{1,39}(?:\s+[A-Z][A-Z'-]{1,39}){1,3})\s+(?=Car\s+(?:details|type)\b)/
        );

    if (
        beforeCarSection &&
        isValidNameCandidate(
            beforeCarSection[1]
        )
    ) {
        return toOneLine(
            beforeCarSection[1]
        );
    }

    // ตรวจทีละบรรทัด

    for (
        let i = 0;
        i < lines.length;
        i++
    ) {
        const line = toOneLine(
            lines[i]
        );

        const lineMatch = line.match(
            /^([A-Z][A-Z'-]{1,39}(?:\s+[A-Z][A-Z'-]{1,39}){1,3})(?=\s|$)/
        );

        if (
            lineMatch &&
            isValidNameCandidate(
                lineMatch[1]
            )
        ) {
            return toOneLine(
                lineMatch[1]
            );
        }
    }

    // กรณีชื่อและนามสกุล
    // ถูกแยกคนละบรรทัด

    for (
        let i = 0;
        i < lines.length - 1;
        i++
    ) {
        const firstName =
            toOneLine(lines[i]);

        const lastName =
            toOneLine(lines[i + 1]);

        const candidate =
            `${firstName} ${lastName}`;

        if (
            isValidNameCandidate(
                candidate
            )
        ) {
            return candidate;
        }
    }

    // ค้นหาชื่อตัวพิมพ์ใหญ่ในข้อความทั้งหมด

    const fullNames = source.match(
        /\b[A-Z][A-Z'-]{1,39}(?:\s+[A-Z][A-Z'-]{1,39}){1,3}\b/g
    );

    if (fullNames) {
        for (
            const candidate of fullNames
        ) {
            if (
                isValidNameCandidate(
                    candidate
                )
            ) {
                return toOneLine(
                    candidate
                );
            }
        }
    }

    return "";
}

// ============================
// ค้นหาเบอร์โทร
// ============================

function extractPhone(text) {
    let match = text.match(
        /\+66[\s-]?\d[\d\s-]{7,}\d/
    );

    if (!match) {
        match = text.match(
            /(?<!\d)0\d{9}(?!\d)/
        );
    }

    return match
        ? match[0].replace(
            /[\s-]/g,
            ""
        )
        : "";
}

// ============================
// ค้นหาชื่อรถ
// ============================

function extractCar(text) {
    for (const car of CAR_MODELS) {
        if (car.pattern.test(text)) {
            return car.name;
        }
    }

    const generic = text.match(
        /\b(?:Toyota|Honda|Mitsubishi|Nissan|Mazda|Isuzu|Ford|MG|BYD|Suzuki|BMW|Mercedes-Benz|Hyundai|Kia)\s+[A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+)?\b/i
    );

    if (!generic) {
        return "";
    }

    return toOneLine(generic[0])
        .replace(
            /\s+or\s+similar.*$/i,
            ""
        )
        .trim();
}
// ============================
// ค้นหาหมายเลขการจอง
// ============================

function extractBookingNumber(text = "") {
    const source = toOneLine(text);

    // Booking No: 009990301967
    let match = source.match(
        /(?:Booking\s*(?:No\.?|Number)|Confirmation\s*(?:No\.?|Number))\s*[:#-]?\s*([A-Z0-9-]{6,})/i
    );

    if (match) {
        return match[1];
    }

    // ภาษาไทย: หมายเลขการจอง
    match = source.match(
        /หมายเลขการจอง\s*:?\s*([A-Z0-9-]{6,})/i
    );

    if (match) {
        return match[1];
    }

    // หมายเลข Voucher ของ Trip เช่น C1622929517823523
    match = source.match(
        /\bC\d{10,20}\b/i
    );

    if (match) {
        return match[0];
    }

    // เลขการจองแบบตัวเลขยาว เช่น 009990301967
    match = source.match(
        /\b\d{12,20}\b/
    );

    if (match) {
        return match[0];
    }

    return "";
}
// ============================
// Parser หลัก
// ============================

function parseTrip(inputText) {
    const booking = Booking();

    const rawText = cleanText(
        inputText || ""
    );

    const flatText =
        toOneLine(rawText);

    const lines = rawText
        .split(/\n+/)
        .map(line =>
            toOneLine(line)
        )
        .filter(Boolean);

    booking.company = "Trip";

    booking.bookingNo =
        extractBookingNumber(
            flatText
        );

    booking.customerName =
        extractCustomerName(
            lines,
            flatText
        );

    booking.renter =
        booking.customerName;

    booking.customerPhone =
        extractPhone(flatText);

    booking.phone =
        booking.customerPhone;

    booking.car =
        extractCar(flatText);

    const dateTimes =
        extractDateTimes(flatText);

    const airportLocations =
        collectAirportLocations(
            flatText
        );

    // ข้อมูลรับรถ

    if (dateTimes.length >= 1) {
        booking.pickupDate =
            dateTimes[0].date;

        booking.pickupTime =
            dateTimes[0].time;

        booking.pickupLocation =
            findAirportNearDate(
                flatText,
                dateTimes[0].index
            ) ||
            airportLocations[0] ||
            "";
    }

    // ข้อมูลคืนรถ

    if (dateTimes.length >= 2) {
        booking.returnDate =
            dateTimes[1].date;

        booking.returnTime =
            dateTimes[1].time;

        booking.returnLocation =
            findAirportNearDate(
                flatText,
                dateTimes[1].index
            ) ||
            airportLocations[1] ||
            airportLocations[0] ||
            "";
    }

    // ทำความสะอาดข้อมูลก่อนส่งกลับ

    booking.customerName =
        toOneLine(
            booking.customerName || ""
        );

    booking.customerPhone =
        toOneLine(
            booking.customerPhone || ""
        );

    booking.car =
        toOneLine(
            booking.car || ""
        );

    booking.pickupDate =
        toOneLine(
            booking.pickupDate || ""
        );

    booking.pickupTime =
        toOneLine(
            booking.pickupTime || ""
        );

    booking.pickupLocation =
        normalizeLocation(
            booking.pickupLocation || ""
        );

    booking.returnDate =
        toOneLine(
            booking.returnDate || ""
        );

    booking.returnTime =
        toOneLine(
            booking.returnTime || ""
        );

    booking.returnLocation =
        normalizeLocation(
            booking.returnLocation || ""
        );

    booking.customerEmail = "";

    return booking;
}

module.exports = parseTrip;